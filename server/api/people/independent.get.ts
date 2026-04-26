import { officialRepos } from '../../data/official-repos'
import { getDB } from '../../utils/db'

export interface IndependentDev {
  owner: string
  repo: string
  displayName: string
  avatar: string
  github: string
  skillCount: number
  lastSyncedAt: number | null
}

interface CachedGitHubProfile {
  name: string | null
  bio: string | null
  blog: string | null
  location: string | null
  type: 'User' | 'Organization'
}

const GH_CACHE_PREFIX = 'github:profile'

export default defineCachedEventHandler(async (event) => {
  const db = getDB(event)
  const owners = officialRepos
    .filter(r => r.kind === 'user')
    .reduce<{ owner: string, repo: string }[]>((acc, r) => {
      if (!acc.some(a => a.owner === r.owner))
        acc.push({ owner: r.owner, repo: r.repo })
      return acc
    }, [])

  if (owners.length === 0)
    return { devs: [], total: 0 }

  const stats = await Promise.all(owners.map(async ({ owner, repo }) => {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS skill_count, MAX(last_synced_at) AS last_synced_at
         FROM skills
         WHERE owner = ?
           AND (broken_since IS NULL OR broken_since > unixepoch() - 604800)`,
      )
      .bind(owner)
      .first<{ skill_count: number, last_synced_at: number | null }>()

    const skillCount = row?.skill_count ?? 0
    if (skillCount === 0)
      return null

    const cached = await useStorage('cache').getItem<CachedGitHubProfile | null>(`${GH_CACHE_PREFIX}:${owner}`)
    const displayName = cached?.name?.trim() || owner

    return {
      owner,
      repo,
      displayName,
      avatar: `https://github.com/${owner}.png`,
      github: `https://github.com/${owner}`,
      skillCount,
      lastSyncedAt: row?.last_synced_at ?? null,
    } satisfies IndependentDev
  }))

  const devs = stats
    .filter((d): d is IndependentDev => d !== null)
    .sort((a, b) => b.skillCount - a.skillCount || a.owner.localeCompare(b.owner))

  return { devs, total: devs.length }
}, {
  maxAge: 60 * 5,
  swr: true,
  getKey: () => 'people:independent:v1',
})
