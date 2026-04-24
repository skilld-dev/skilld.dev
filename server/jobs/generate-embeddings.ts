/// <reference types="@cloudflare/workers-types" />
/**
 * Embedding similarity prototype. Uses Voyage (voyage-3-lite is cheap; we only
 * embed ~80k short strings once, re-embed on SKILL.md sha change). If no
 * VOYAGE_API_KEY is available, falls back to a deterministic hash-based
 * pseudo-embedding so the full pipeline (storage, kNN, page wiring) can be
 * exercised offline — the neighbors won't be semantic, but shapes match.
 *
 * Storage: precomputed top-N neighbor list per skill, written to KV as one
 * blob keyed by model+version. No vector DB.
 */
import { getGenerated, putGenerated, sha1 } from '../utils/skill-generated'

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'
const EMBED_DIM = 512

export interface EmbeddingPayload {
  vector: number[]
  dim: number
  model: string
}

export interface EmbeddingNeighbor {
  name: string
  owner: string
  similarity: number
}

export interface EmbeddingContext {
  db: D1Database
  voyageKey?: string | undefined
}

export interface EmbeddingSkill {
  owner: string
  repo: string
  name: string
  displayName: string
  description?: string | null
  raw: string
}

function inputText(skill: EmbeddingSkill): string {
  const head = skill.raw.slice(0, 500)
  const desc = skill.description ? `${skill.description}\n\n` : ''
  return `${skill.displayName}\n${desc}${head}`.trim()
}

/**
 * Deterministic pseudo-embedding. Hashes tokens into buckets. Useless for
 * semantic meaning, good for wiring-level tests and deterministic snapshots.
 */
function hashEmbed(text: string, dim = EMBED_DIM): number[] {
  const vec = new Float32Array(dim)
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  for (const t of tokens) {
    let h = 2166136261
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    const idx = Math.abs(h) % dim
    const sign = (h & 1) === 0 ? 1 : -1
    vec[idx]! += sign
  }
  // L2 normalize
  let norm = 0
  for (let i = 0; i < dim; i++) norm += vec[i]! * vec[i]!
  norm = Math.sqrt(norm) || 1
  const out: number[] = Array.from({ length: dim })
  for (let i = 0; i < dim; i++) out[i] = vec[i]! / norm
  return out
}

async function embedWithVoyage(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ input: [text], model: 'voyage-3-lite', output_dimension: EMBED_DIM }),
  })
  if (!res.ok)
    throw new Error(`Voyage ${res.status}: ${await res.text().catch(() => '')}`)
  const data = await res.json() as { data: { embedding: number[] }[] }
  return data.data[0]!.embedding
}

export async function generateEmbedding(ctx: EmbeddingContext, skill: EmbeddingSkill): Promise<EmbeddingPayload | null> {
  const text = inputText(skill)
  if (!text)
    return null
  const model = ctx.voyageKey ? 'voyage-3-lite' : 'hash-fallback-v1'
  // Bake model into sha so switching embedder forces regeneration.
  const currentSha = await sha1(`${model}\n${text}`)

  const existing = await getGenerated<EmbeddingPayload>(ctx.db, { owner: skill.owner, name: skill.name, kind: 'embedding' })
  if (existing && existing.sha === currentSha)
    return existing.payload

  let vector: number[]
  if (ctx.voyageKey)
    vector = await embedWithVoyage(text, ctx.voyageKey)
  else
    vector = hashEmbed(text)

  const payload: EmbeddingPayload = { vector, dim: vector.length, model }
  await putGenerated(ctx.db, {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    kind: 'embedding',
    sha: currentSha,
    payload,
  })
  return payload
}

function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < len; i++) dot += a[i]! * b[i]!
  return dot
}

/**
 * Build a precomputed neighbor index by scanning all stored embeddings.
 * O(n²) but embeddings are small (512 floats) and we only run this offline.
 */
export async function buildNeighborIndex(db: D1Database, topN = 10): Promise<Record<string, EmbeddingNeighbor[]>> {
  const res = await db
    .prepare('SELECT owner, repo, name, payload FROM skill_generated WHERE kind = ?')
    .bind('embedding')
    .all<{ owner: string, repo: string, name: string, payload: string }>()

  const rows = (res.results ?? []).map((r) => {
    const p = JSON.parse(r.payload) as EmbeddingPayload
    return { owner: r.owner, name: r.name, vec: p.vector }
  })

  const out: Record<string, EmbeddingNeighbor[]> = {}
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!
    const candidates: EmbeddingNeighbor[] = []
    for (let j = 0; j < rows.length; j++) {
      if (i === j)
        continue
      const b = rows[j]!
      const sim = cosine(a.vec, b.vec)
      candidates.push({ name: b.name, owner: b.owner, similarity: sim })
    }
    candidates.sort((x, y) => y.similarity - x.similarity)
    out[`${a.owner}/${a.name}`] = candidates.slice(0, topN)
  }
  return out
}

const NEIGHBOR_CACHE_KEY = 'skills:embedding-neighbors:v1'
const NEIGHBOR_TTL = 60 * 60 * 24 // embeddings are stable, rebuild once a day

export async function getEmbeddingNeighbors(
  db: D1Database,
  skill: { owner: string, name: string },
): Promise<EmbeddingNeighbor[]> {
  let index = await useStorage('cache').getItem<Record<string, EmbeddingNeighbor[]>>(NEIGHBOR_CACHE_KEY)
  if (!index) {
    index = await buildNeighborIndex(db)
    await useStorage('cache').setItem(NEIGHBOR_CACHE_KEY, index, { ttl: NEIGHBOR_TTL })
  }
  return index[`${skill.owner}/${skill.name}`] ?? []
}
