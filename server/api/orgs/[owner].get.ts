import type { TagPayload } from '../../jobs/generate-tags'
import type { RegistrySkill } from '../../utils/skills-registry'
import { officialRepos } from '../../data/official-repos'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'
import { getDB } from '../../utils/db'
import { getGeneratedBatch } from '../../utils/skill-generated'
import { querySkills } from '../../utils/skills-registry'

export type OrgKind = 'org' | 'user'

export interface OrgRepo {
  repo: string
  count: number
  stars: number
}

export interface OrgTag {
  slug: string
  label: string
  count: number
}

export interface OrgProfile {
  owner: string
  kind: OrgKind
  displayName: string
  description: string | null
  blog: string | null
  location: string | null
  avatar: string
  github: string
  totalSkills: number
  totalStars: number
  repos: OrgRepo[]
  topTags: OrgTag[]
  skills: RegistrySkill[]
  fetchedAt: string
}

interface GitHubProfile {
  name: string | null
  bio: string | null
  blog: string | null
  location: string | null
  type: 'User' | 'Organization'
}

const GH_CACHE_PREFIX = 'github:profile'
const GH_CACHE_TTL = 60 * 60 * 6 // 6 hours
const GH_NEGATIVE_TTL = 60 * 10 // 10 minutes for misses

const officialOwners = new Set(officialRepos.map(r => r.owner))
const kindByOwner = new Map(officialRepos.map(r => [r.owner, r.kind]))

async function fetchGitHubProfile(owner: string): Promise<GitHubProfile | null> {
  const cacheKey = `${GH_CACHE_PREFIX}:${owner}`
  const cached = await useStorage('cache').getItem<GitHubProfile | null>(cacheKey)
  if (cached !== undefined && cached !== null)
    return cached as GitHubProfile

  const res = await fetch(`https://api.github.com/users/${owner}`, {
    headers: {
      'User-Agent': 'skilld.dev',
      'Accept': 'application/vnd.github+json',
    },
  }).catch(() => null)

  if (!res || !res.ok) {
    await useStorage('cache').setItem(cacheKey, null, { ttl: GH_NEGATIVE_TTL })
    return null
  }

  const data = await res.json() as {
    name?: string
    bio?: string
    blog?: string
    location?: string
    type?: string
  }

  const profile: GitHubProfile = {
    name: data.name?.trim() || null,
    bio: data.bio?.trim() || null,
    blog: data.blog?.trim() || null,
    location: data.location?.trim() || null,
    type: data.type === 'User' ? 'User' : 'Organization',
  }

  await useStorage('cache').setItem(cacheKey, profile, { ttl: GH_CACHE_TTL })
  return profile
}

export default defineCachedEventHandler(async (event) => {
  const ownerParam = getRouterParam(event, 'owner')
  if (!ownerParam)
    throw createError({ statusCode: 400, message: 'Missing owner parameter' })

  const owner = ownerParam.toLowerCase()

  const [registryResult, github] = await Promise.all([
    querySkills(event, {
      owner,
      sort: 'installs',
      page: 1,
      limit: 200,
      officialOwners,
    }),
    fetchGitHubProfile(owner),
  ])

  if (registryResult.items.length === 0) {
    throw createError({ statusCode: 404, message: `No skills found for @${owner}` })
  }

  const manifestKind = kindByOwner.get(owner)
  const kind: OrgKind = manifestKind
    ?? (github?.type === 'User' ? 'user' : 'org')

  const repoMap = new Map<string, OrgRepo>()
  for (const skill of registryResult.items) {
    const entry = repoMap.get(skill.repo) ?? { repo: skill.repo, count: 0, stars: 0 }
    entry.count++
    if (skill.stars > entry.stars)
      entry.stars = skill.stars
    repoMap.set(skill.repo, entry)
  }
  const repos = [...repoMap.values()].sort((a, b) => b.count - a.count)

  const tagMap = await getGeneratedBatch<TagPayload>(
    getDB(event),
    registryResult.items.map(s => ({ owner: s.owner, name: s.name })),
    'tags',
  )
  const tagCounts = new Map<string, number>()
  for (const item of tagMap.values()) {
    for (const tag of item.payload.tags ?? [])
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const topTags: OrgTag[] = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([slug, count]) => ({
      slug,
      label: TAG_BY_SLUG.get(slug)?.label ?? slug,
      count,
    }))

  const totalStars = registryResult.items.reduce((max, s) => s.stars > max ? s.stars : max, 0)

  const profile: OrgProfile = {
    owner,
    kind,
    displayName: github?.name || owner,
    description: github?.bio ?? null,
    blog: github?.blog ?? null,
    location: github?.location ?? null,
    avatar: `https://github.com/${owner}.png`,
    github: `https://github.com/${owner}`,
    totalSkills: registryResult.items.length,
    totalStars,
    repos,
    topTags,
    skills: registryResult.items,
    fetchedAt: new Date().toISOString(),
  }

  return profile
}, {
  maxAge: 60 * 5,
  swr: true,
  getKey: (event) => {
    const owner = getRouterParam(event, 'owner')
    return `org:${(owner || '').toLowerCase()}`
  },
})
