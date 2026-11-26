import { defineEventHandler, setHeader } from 'h3'
import { getDB } from '#server/utils/db'
import { cached } from '#shared/server/cache'
import { TAXONOMY } from '../../jobs/taxonomy'
import { runAfterResponse } from '../../utils/after-response'
import { notBrokenSql } from '../../utils/broken'

const NOT_BROKEN_SQL = notBrokenSql('r')
const TAG_FACETS_CACHE_KEY = 'skills:tag-facets:v2'
const TAG_FACETS_TTL_SECONDS = 60 * 60
const TAG_FACETS_STALE_SECONDS = 60 * 60 * 24
const ISOLATE_CACHE_MS = 60_000
let isolateCache: { value: TagFacetsResponse, expiresAt: number } | null = null

export interface TagFacet {
  slug: string
  label: string
  description: string
  count: number
}

export interface TagFacetsResponse {
  tags: TagFacet[]
  total: number
}

// Tag payloads change only when generation writes `skill_generated`, and each
// recompute expands every tag list (~49K rows read). Cache globally in KV with
// SWR + refresh-claim deduplication and a 60s isolate cache.
export default defineEventHandler(async (event): Promise<TagFacetsResponse> => {
  setHeader(event, 'cloudflare-cdn-cache-control', 'public, max-age=600, stale-while-revalidate=3600')
  const now = Date.now()
  if (isolateCache && isolateCache.expiresAt > now)
    return isolateCache.value

  const value = await cached<TagFacetsResponse>({
    storage: useStorage('cache'),
    key: TAG_FACETS_CACHE_KEY,
    ttlSeconds: TAG_FACETS_TTL_SECONDS,
    staleSeconds: TAG_FACETS_STALE_SECONDS,
    schedule: promise => runAfterResponse(event, promise),
    compute: async () => {
      const db = getDB(event)

      const res = await db
        .prepare(
          `SELECT je.value AS slug, COUNT(DISTINCT sg.owner || '/' || sg.repo || '/' || sg.name) AS count
           FROM skill_generated sg, json_each(sg.payload, '$.tags') je
           JOIN skills s ON s.owner = sg.owner AND s.repo = sg.repo AND s.name = sg.name
           JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
           WHERE sg.kind = 'tags' AND ${NOT_BROKEN_SQL}
           GROUP BY je.value`,
        )
        .all<{ slug: string, count: number }>()

      const counts = new Map<string, number>()
      for (const r of res.results ?? [])
        counts.set(r.slug, r.count)

      const tags: TagFacet[] = TAXONOMY
        .map(t => ({
          slug: t.slug,
          label: t.label,
          description: t.description,
          count: counts.get(t.slug) ?? 0,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

      const total = tags.reduce((n, t) => n + t.count, 0)
      return { tags, total }
    },
  })
  isolateCache = { value, expiresAt: now + ISOLATE_CACHE_MS }
  return value
})
