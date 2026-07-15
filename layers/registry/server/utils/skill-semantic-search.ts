/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'
import { getDB } from '../../../../shared/server/db'
import { vectorIdFor } from './vector-id'

// Same model + dim the AI generation pipeline embeds skills with
// (ai-generate-submit.ts), so query vectors live in the same space as the
// indexed skill vectors.
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
const VECTORIZE_DIM = 768
const ID_MAP_TTL_MS = 10 * 60 * 1000

interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>
}

interface SkillKey {
  owner: string
  repo: string
  name: string
}

export interface SemanticHit extends SkillKey {
  /** Cosine similarity from Vectorize, 0..1. */
  score: number
}

// Vectorize ids are sha256(owner/repo/name) (vector-id.ts), which we can't
// reverse. Maintain an id -> key map derived from the (small, curated) skills
// table so query() results map back to rows. Cached per-isolate; stale entries
// for deleted skills simply never resolve, fresh skills appear on rebuild.
let idMap: Map<string, SkillKey> | null = null
let idMapBuiltAt = 0

async function getIdMap(db: D1Database): Promise<Map<string, SkillKey>> {
  const now = Date.now()
  if (idMap && now - idMapBuiltAt < ID_MAP_TTL_MS)
    return idMap

  const rows = await db.prepare('SELECT owner, repo, name FROM skills').all<SkillKey>()
  const map = new Map<string, SkillKey>()
  for (const r of rows.results ?? [])
    map.set(await vectorIdFor(r), r)

  idMap = map
  idMapBuiltAt = now
  return map
}

/**
 * Semantic skill search over the Vectorize index. Returns hits ordered by
 * cosine similarity, or `null` when the AI / Vectorize bindings are absent
 * (e.g. local dev) so callers can fall back to lexical FTS.
 */
// topK is capped well under D1's 100 bound-parameter limit: each hit becomes
// one param in the IN clause, leaving headroom for owner/tag/category filters.
export async function semanticSkillSearch(event: H3Event, query: string, topK = 60): Promise<SemanticHit[] | null> {
  const env = event.context.platform?.env
  const ai = env?.AI as AiBinding | undefined
  const vectorize = env?.SKILL_EMBEDDINGS
  if (!ai || !vectorize)
    return null

  const embed = await ai.run(EMBEDDING_MODEL, { text: [query] }).catch(() => null)
  const vec = (embed as { data?: number[][] } | null)?.data?.[0]
  if (!vec || vec.length !== VECTORIZE_DIM)
    return null

  const res = await vectorize
    .query(vec, { topK, returnValues: false, returnMetadata: 'none' })
    .catch(() => null)
  if (!res?.matches?.length)
    return []

  const map = await getIdMap(getDB(event))
  const hits: SemanticHit[] = []
  for (const m of res.matches) {
    const key = map.get(m.id)
    if (key)
      hits.push({ ...key, score: m.score })
  }
  return hits
}

const WHITESPACE_RE = /\s+/

/**
 * Lexical boost layered on cosine score so exact / substring name matches stay
 * pinned above fuzzy semantic neighbours (cosine scores sit ~0.2-0.9).
 */
export function nameMatchBoost(fields: { name: string, displayName: string, slug: string }, query: string): number {
  const q = query.toLowerCase().trim()
  if (!q)
    return 0
  const name = fields.name.toLowerCase()
  const display = fields.displayName.toLowerCase()
  const slug = fields.slug.toLowerCase()
  if (q === name || q === display || q === slug)
    return 1
  if (name.includes(q) || display.includes(q) || slug.includes(q))
    return 0.4
  const terms = q.split(WHITESPACE_RE).filter(Boolean)
  if (!terms.length)
    return 0
  const hay = `${name} ${display} ${slug}`
  const matched = terms.filter(t => hay.includes(t)).length
  return 0.25 * (matched / terms.length)
}
