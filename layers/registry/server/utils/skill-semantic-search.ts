/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'
import { getDB } from '#server/utils/db'
import { writeCache } from '#shared/server/cache'
import { EMBEDDING_MODEL, EMBEDDING_VECTOR_DIMENSIONS } from './embedding-effect'
import { vectorIdFor } from './vector-id'

const VECTORIZE_METADATA_TOP_K = 50
const ID_MAP_TTL_MS = 10 * 60 * 1000
// Query vectors are a pure function of (model, text), so they only expire to
// stop unbounded growth, not because they go stale.
const QUERY_VECTOR_TTL = 60 * 60 * 24

/**
 * bge-* models are trained asymmetrically: passages are embedded bare, queries
 * are embedded behind this instruction. Without it a short query lands in a
 * slightly different region of the space than the documents it should match,
 * which is why cosine scores were bunched into a narrow band and why word
 * senses got confused ("stop memory leaks" retrieving agent-memory skills).
 * Documents are embedded bare in embedding-effect.ts, so this belongs on the
 * query side only.
 */
const QUERY_INSTRUCTION = 'Represent this sentence for searching relevant passages: '

interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>
}

interface SkillKey {
  owner: string
  repo: string
  name: string
}

export interface SemanticHit extends SkillKey {
  /** Cosine similarity from Vectorize, -1..1. */
  score: number
}

export function clampSemanticTopK(requested: number): number {
  return Math.min(VECTORIZE_METADATA_TOP_K, Math.max(1, requested))
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
 * cosine similarity. Returns `null` when bindings or providers are unavailable,
 * so callers can distinguish a failure from an empty result.
 */
// The candidate pool is passed to D1 as a single JSON array parameter
// (json_each), so topK is no longer bounded by D1's 100 SQL-variable cap.
export async function semanticSkillSearch(event: H3Event, query: string, topK = 200): Promise<SemanticHit[] | null> {
  const env = event.context.platform?.env
  const ai = env?.AI as AiBinding | undefined
  const vectorize = env?.SKILL_EMBEDDINGS
  if (!ai || !vectorize)
    return null

  const vec = await embedQuery(ai, query)
  if (!vec)
    return null

  // Vectors carry owner/repo/name in metadata, so asking for it back avoids
  // the sha256 id-map rebuild (a full scan of `skills`) on the search path.
  const res = await vectorize
    .query(vec, { topK: clampSemanticTopK(topK), returnValues: false, returnMetadata: 'all' })
    .catch(() => {
      emitOperationalEvent(createWideEvent({ operation: 'skill-semantic-search', outcome: 'failed' }))
      return null
    })
  if (res === null)
    return null
  if (!res.matches.length)
    return []

  const matches = res.matches.filter(m => typeof m.score === 'number' && Number.isFinite(m.score))
  if (matches.length !== res.matches.length)
    emitOperationalEvent(createWideEvent({ operation: 'skill-semantic-search-response', outcome: 'failed' }))
  if (!matches.length)
    return null

  const hits: SemanticHit[] = []
  let needsIdMap = false
  for (const m of matches) {
    const key = keyFromMetadata(m.metadata)
    if (key)
      hits.push({ ...key, score: m.score })
    else
      needsIdMap = true
  }
  // Vectors written before metadata carried the key still need the id map.
  if (!needsIdMap)
    return hits

  const map = await getIdMap(getDB(event))
  return matches.flatMap((m) => {
    const key = keyFromMetadata(m.metadata) ?? map.get(m.id)
    return key ? [{ ...key, score: m.score }] : []
  })
}

/**
 * Embed the query, memoised in the edge cache. The model is deterministic, so a
 * repeated query never needs a second inference. Search is typed one keystroke
 * at a time, and the popular prefixes of popular queries repeat constantly:
 * this is the difference between every keystroke paying for an inference and
 * only the novel ones doing so.
 */
async function embedQuery(ai: AiBinding, query: string): Promise<number[] | null> {
  const storage = useStorage('edge-cache')
  // Keep the default mean pooling used by the existing document vectors.
  const contract = JSON.stringify([EMBEDDING_MODEL, 'mean', QUERY_INSTRUCTION, query])
  const cacheKey = `search:qvec:v2:${await sha256Hex(contract)}`
  // A cache read failure is not a search failure: fall through to inference.
  const cached = await storage.getItem<unknown>(cacheKey).catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'semantic-query-vector-cache-read', outcome: 'failed' }))
    return null
  })
  if (isQueryVector(cached))
    return cached
  if (cached != null)
    emitOperationalEvent(createWideEvent({ operation: 'semantic-query-vector-cache-value', outcome: 'failed' }))

  const outcome = await ai.run(EMBEDDING_MODEL, { text: [`${QUERY_INSTRUCTION}${query}`] }).then(response => ({ response })).catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'semantic-query-embedding', outcome: 'failed' }))
    return null
  })
  if (outcome === null)
    return null
  const embed = outcome.response
  const vec = typeof embed === 'object' && embed !== null && 'data' in embed && Array.isArray(embed.data)
    ? embed.data[0]
    : null
  if (!isQueryVector(vec)) {
    emitOperationalEvent(createWideEvent({ operation: 'semantic-query-embedding-response', outcome: 'failed' }))
    return null
  }

  await writeCache(storage, cacheKey, vec, { ttl: QUERY_VECTOR_TTL })
  return vec
}

function isQueryVector(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === EMBEDDING_VECTOR_DIMENSIONS
    && value.every(component => typeof component === 'number' && Number.isFinite(component))
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function keyFromMetadata(metadata: unknown): SkillKey | null {
  if (!metadata || typeof metadata !== 'object')
    return null
  const { owner, repo, name } = metadata as Record<string, unknown>
  if (typeof owner !== 'string' || typeof repo !== 'string' || typeof name !== 'string')
    return null
  return { owner, repo, name }
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
