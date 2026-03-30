import type { IndexedCurator } from '../utils/atproto/curator-index'
import { getPublicAgent } from '../utils/atproto/agent'
import { listCollectionRecords } from '../utils/atproto/collections'
import { getAllCurators } from '../utils/atproto/curator-index'

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

export default defineEventHandler(async (event) => {
  const cached = await useStorage('cache').getItem<HomepageData>(CACHE_KEY)
  if (cached)
    return cached

  const curators = await getAllCurators(getDB(event))

  // Fetch collections from each curator's PDS (cap at 10 curators for performance)
  const agent = getPublicAgent()
  const collections: HomepageCollection[] = []

  const topCurators = curators
    .sort((a, b) => b.lastPublished.localeCompare(a.lastPublished))
    .slice(0, 10)

  await Promise.all(topCurators.map(async (curator) => {
    const records = await listCollectionRecords(agent, curator.did, 5).catch(() => [])

    for (const { record } of records) {
      collections.push({
        name: record.name,
        slug: record.slug,
        description: record.description,
        skillCount: record.skills.length,
        skills: record.skills.map(s => s.packageName),
        stacks: record.stacks,
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

  await useStorage('cache').setItem(CACHE_KEY, result, { ttl: CACHE_TTL })
  return result
})
