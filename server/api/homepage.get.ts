import type { IndexedCurator } from '../utils/atproto/curator-index'
import type { RegistrySkill } from '../utils/skills-registry'
import { officialRepos } from '../data/official-repos'
import { listCollectionRecords } from '../utils/atproto/collections'
import { getAllCurators } from '../utils/atproto/curator-index'
import { getDB } from '../utils/db'

const CACHE_KEY = 'homepage:data'
const CACHE_TTL = 60 * 5 // 5 minutes

const officialOwners = new Set(officialRepos.map(r => r.owner))

interface HomepageCollection {
  name: string
  slug: string
  description: string
  preambleExcerpt?: string
  skillCount: number
  skills: string[]
  stacks: string[]
  curator: { did: string, handle: string, displayName?: string, avatar?: string }
}

interface PopularSkill extends RegistrySkill {
  collectionCount: number
  official: boolean
}

interface HomepageData {
  curators: IndexedCurator[]
  collections: HomepageCollection[]
  popularSkills: PopularSkill[]
  stats: { curators: number, collections: number, skills: number }
  fetchedAt: string
}

export default defineEventHandler(async (event) => {
  const cached = await useStorage('cache').getItem<HomepageData>(CACHE_KEY)
  if (cached)
    return cached

  const db = getDB(event)
  const curators = await getAllCurators(db)

  // Fetch collections from each curator's PDS (cap at 10 curators for performance)
  const collections: HomepageCollection[] = []
  // Count by (owner, name) when owner is known; otherwise by name for legacy entries.
  const skillCounts = new Map<string, { owner?: string, name: string, count: number }>()

  const topCurators = curators
    .sort((a, b) => b.lastPublished.localeCompare(a.lastPublished))
    .slice(0, 10)

  const results = await Promise.allSettled(topCurators.map(async (curator) => {
    const records = await listCollectionRecords(curator.did, 5)

    for (const { record } of records) {
      // Count all skill appearances across collections
      for (const skill of record.skills) {
        const key = skill.owner ? `${skill.owner}/${skill.packageName}` : skill.packageName
        const existing = skillCounts.get(key)
        if (existing)
          existing.count++
        else
          skillCounts.set(key, { owner: skill.owner, name: skill.packageName, count: 1 })
      }

      // Skip personal collections (slug "skills") — only show named collections
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
      console.warn('[homepage] Failed to fetch curator collections:', result.reason)
  }

  // Sort collections by curator recency
  collections.sort((a, b) => {
    const aCurator = curators.find(c => c.did === a.curator.did)
    const bCurator = curators.find(c => c.did === b.curator.did)
    return (bCurator?.lastPublished ?? '').localeCompare(aCurator?.lastPublished ?? '')
  })

  // Build popular skills from collection data
  const topSkills = [...skillCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  interface SkillRow { name: string, owner: string, repo: string, display_name: string, installs: number, slug: string }

  let popularSkills: PopularSkill[] = []
  if (topSkills.length) {
    const uniqueNames = [...new Set(topSkills.map(s => s.name))]
    const placeholders = uniqueNames.map(() => '?').join(',')
    const rows = await db
      .prepare(`SELECT * FROM skills WHERE name IN (${placeholders})`)
      .bind(...uniqueNames)
      .all<SkillRow>()

    // Group rows by name so we can resolve (owner, name) exactly, or pick top-installs when owner unknown.
    const rowsByName = new Map<string, SkillRow[]>()
    for (const r of rows.results ?? []) {
      const list = rowsByName.get(r.name) ?? []
      list.push(r)
      rowsByName.set(r.name, list)
    }

    popularSkills = topSkills
      .map(({ owner, name, count }) => {
        const candidates = rowsByName.get(name)
        if (!candidates?.length)
          return null
        const r = owner
          ? candidates.find(c => c.owner === owner)
          : [...candidates].sort((a, b) => b.installs - a.installs)[0]
        if (!r)
          return null
        return {
          name: r.name,
          owner: r.owner,
          repo: r.repo,
          displayName: r.display_name,
          installs: r.installs,
          slug: r.slug,
          collectionCount: count,
          official: officialOwners.has(r.owner),
        }
      })
      .filter((s): s is PopularSkill => s !== null)
  }

  const totalSkills = collections.reduce((sum, c) => sum + c.skillCount, 0)

  const result: HomepageData = {
    curators,
    collections: collections.slice(0, 8),
    popularSkills,
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
