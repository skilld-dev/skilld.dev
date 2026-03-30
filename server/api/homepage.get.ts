import type { IndexedCurator } from '../utils/atproto/curator-index'
import { getPublicAgent } from '../utils/atproto/agent'
import { getAllCurators } from '../utils/atproto/curator-index'
import { COLLECTION_NSID, parseCollectionRecord } from '../utils/atproto/lexicons/collection'

const CACHE_KEY = 'homepage:data'
const CACHE_TTL = 60 * 5 // 5 minutes

interface HomepageCollection {
  name: string
  slug: string
  description: string
  skillCount: number
  skills: string[]
  stacks: string[]
  curator: { did: string, handle: string, displayName?: string, avatar?: string }
}

interface HomepageData {
  curators: IndexedCurator[]
  collections: HomepageCollection[]
  stats: { curators: number, collections: number, skills: number }
  fetchedAt: string
}

export default defineEventHandler(async () => {
  const cached = await useStorage('data').getItem<HomepageData>(CACHE_KEY)
  if (cached)
    return cached

  const curators = await getAllCurators()

  // Fetch collections from each curator's PDS (cap at 10 curators for performance)
  const agent = getPublicAgent()
  const collections: HomepageCollection[] = []

  const topCurators = curators
    .sort((a, b) => b.lastPublished.localeCompare(a.lastPublished))
    .slice(0, 10)

  await Promise.all(topCurators.map(async (curator) => {
    const res = await agent.com.atproto.repo.listRecords({
      repo: curator.did,
      collection: COLLECTION_NSID,
      limit: 5,
    }).catch(() => null)

    if (!res?.data.records)
      return

    for (const record of res.data.records) {
      const val = parseCollectionRecord(record.value)
      if (!val)
        continue
      collections.push({
        name: val.name,
        slug: val.slug,
        description: val.description,
        skillCount: val.skills.length,
        skills: val.skills.map(s => s.packageName),
        stacks: val.stacks,
        curator: {
          did: curator.did,
          handle: curator.handle,
          displayName: curator.displayName,
          avatar: curator.avatar,
        },
      })
    }
  }))

  // Sort collections by curator recency
  collections.sort((a, b) => {
    const aCurator = curators.find(c => c.did === a.curator.did)
    const bCurator = curators.find(c => c.did === b.curator.did)
    return (bCurator?.lastPublished ?? '').localeCompare(aCurator?.lastPublished ?? '')
  })

  const totalSkills = collections.reduce((sum, c) => sum + c.skillCount, 0)

  const result: HomepageData = {
    curators,
    collections: collections.slice(0, 8),
    stats: {
      curators: curators.length,
      collections: collections.length,
      skills: totalSkills,
    },
    fetchedAt: new Date().toISOString(),
  }

  await useStorage('data').setItem(CACHE_KEY, result, { ttl: CACHE_TTL })
  return result
})
