import { listCollectionRecords } from '../../utils/atproto/collections'
import { getAllCurators } from '../../utils/atproto/curator-index'
import { getDB } from '../../utils/db'

const CACHE_KEY = 'collections:index'
const CACHE_TTL = 60 * 5 // 5 minutes

interface IndexCollection {
  name: string
  slug: string
  description: string
  preambleExcerpt?: string
  skillCount: number
  skills: string[]
  stacks: string[]
  updatedAt: string
  curator: { did: string, handle: string, displayName?: string, avatar?: string }
}

interface IndexResponse {
  featured: IndexCollection[]
  recent: IndexCollection[]
  total: number
  fetchedAt: string
}

export default defineEventHandler(async (event) => {
  const cached = await useStorage('cache').getItem<IndexResponse>(CACHE_KEY)
  if (cached)
    return cached

  const db = getDB(event)
  const curators = await getAllCurators(db)

  const collections: IndexCollection[] = []
  const results = await Promise.allSettled(curators.map(async (curator) => {
    const records = await listCollectionRecords(curator.did, 20)
    for (const { record } of records) {
      if (record.slug === 'skills')
        continue
      collections.push({
        name: record.name,
        slug: record.slug,
        description: record.description,
        ...(record.preamble ? { preambleExcerpt: excerpt(record.preamble) } : {}),
        skillCount: record.skills.length,
        skills: record.skills.map(s => s.packageName),
        stacks: record.stacks,
        updatedAt: record.updatedAt,
        curator: {
          did: curator.did,
          handle: curator.handle,
          displayName: curator.displayName,
          avatar: curator.avatar,
        },
      })
    }
  }))

  for (const result of results) {
    if (result.status === 'rejected')
      console.warn('[collections:index] Failed to fetch curator collections:', result.reason)
  }

  collections.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const curatorScore = new Map<string, number>()
  for (const c of curators) {
    const labelBoost = c.labels.includes('verified-maintainer')
      ? 1000
      : c.labels.includes('prolific')
        ? 100
        : c.labels.includes('early-curator')
          ? 10
          : 0
    curatorScore.set(c.did, labelBoost + c.collectionCount)
  }

  const featured = [...collections]
    .sort((a, b) => {
      const sa = curatorScore.get(a.curator.did) ?? 0
      const sb = curatorScore.get(b.curator.did) ?? 0
      if (sa !== sb)
        return sb - sa
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    .slice(0, 4)

  const featuredSlugs = new Set(featured.map(c => `${c.curator.did}/${c.slug}`))
  const recent = collections.filter(c => !featuredSlugs.has(`${c.curator.did}/${c.slug}`))

  const result: IndexResponse = {
    featured,
    recent,
    total: collections.length,
    fetchedAt: new Date().toISOString(),
  }

  await useStorage('cache').setItem(CACHE_KEY, result, { ttl: CACHE_TTL })
  return result
})
