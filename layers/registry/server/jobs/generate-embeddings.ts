import { writeCache } from '#shared/server/cache'
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
import { vectorIdFor } from '../utils/vector-id'

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

  const existing = await getGenerated<EmbeddingPayload>(ctx.db, { owner: skill.owner, repo: skill.repo, name: skill.name, kind: 'embedding' })
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

interface VectorizeMetadata {
  owner?: unknown
  repo?: unknown
  name?: unknown
}

const NEIGHBOR_CACHE_TTL = 60 * 60 * 6
const NEIGHBOR_TOP_K = 10

export async function getEmbeddingNeighbors(
  vectorize: VectorizeIndex | undefined,
  skill: { owner: string, repo: string, name: string },
): Promise<EmbeddingNeighbor[]> {
  if (!vectorize)
    return []

  // Vectorize ids are SHA-256 hex of `${owner}/${repo}/${name}` (64-byte
  // cap on natural keys). Cache key keeps the human-readable form.
  const naturalKey = `${skill.owner}/${skill.repo}/${skill.name}`
  const id = await vectorIdFor(skill)
  const cacheKey = `skills:embedding-neighbors:v3:${naturalKey}`
  const cached = await useStorage('cache').getItem<EmbeddingNeighbor[]>(cacheKey)
  if (cached)
    return cached

  const matches = await queryByVectorId(vectorize, id, {
    topK: NEIGHBOR_TOP_K + 1,
    returnMetadata: 'indexed',
  }).catch((err: Error) => {
    console.warn(`[embedding-neighbors] vector query failed for ${naturalKey}:`, err.message)
    return null
  })

  if (!matches?.matches?.length)
    return []

  const neighbors: EmbeddingNeighbor[] = []
  for (const m of matches.matches) {
    if (m.id === id)
      continue
    const meta = (m.metadata ?? {}) as VectorizeMetadata
    const owner = typeof meta.owner === 'string' ? meta.owner : m.id.split('/')[0]
    const name = typeof meta.name === 'string' ? meta.name : m.id.split('/')[2]
    if (!owner || !name)
      continue
    neighbors.push({ owner, name, similarity: m.score })
    if (neighbors.length >= NEIGHBOR_TOP_K)
      break
  }

  await writeCache(useStorage('cache'), cacheKey, neighbors, { ttl: NEIGHBOR_CACHE_TTL })
  return neighbors
}

interface QueryByIdVectorize {
  queryById: (vectorId: string, options?: VectorizeQueryOptions) => Promise<VectorizeMatches>
}

function supportsQueryById(vectorize: VectorizeIndex): vectorize is VectorizeIndex & QueryByIdVectorize {
  return 'queryById' in vectorize && typeof vectorize.queryById === 'function'
}

async function queryByVectorId(
  vectorize: VectorizeIndex,
  id: string,
  options: VectorizeQueryOptions,
): Promise<VectorizeMatches> {
  if (supportsQueryById(vectorize))
    return await vectorize.queryById(id, options)

  const [source] = await vectorize.getByIds([id])
  if (!source)
    return { matches: [], count: 0 }
  return await vectorize.query(source.values, options)
}
