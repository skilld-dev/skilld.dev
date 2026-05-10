import type { RegistrySkill } from '~~/layers/registry/server/utils/skills-registry'
import type { TagPayload } from '../../jobs/generate-tags'
import { getGeneratedBatch } from '~~/layers/registry/server/utils/skill-generated'
import { querySkills } from '~~/layers/registry/server/utils/skills-registry'
import { getDB } from '../../../../../shared/server/db'
import { officialRepos } from '../../data/official-repos'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'

export type OrgKind = 'org' | 'user'

export interface OrgRepo {
  repo: string
  count: number
  stars: number
  description: string | null
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
  followers: number
  totalSkills: number
  totalStars: number
  repos: OrgRepo[]
  topTags: OrgTag[]
  skills: RegistrySkill[]
  lastSyncedAt: number | null
  syncStatus: 'ok' | 'failed' | 'never' | null
  fetchedAt: string
}

interface OwnerRow {
  kind: 'user' | 'org' | null
  name: string | null
  bio: string | null
  blog: string | null
  location: string | null
  followers: number | null
  last_synced_at: number | null
  sync_status: string | null
}

const OWNER_FRESH_HOURS = 24 * 7

const officialOwners = new Set(officialRepos.map(r => r.owner))
const kindByOwner = new Map(officialRepos.map(r => [r.owner, r.kind]))

async function fetchAndStoreOwner(owner: string, db: D1Database): Promise<OwnerRow | null> {
  const res = await fetch(`https://api.github.com/users/${owner}`, {
    headers: {
      'User-Agent': 'skilld.dev',
      'Accept': 'application/vnd.github+json',
    },
  }).catch(() => null)

  if (!res || !res.ok) {
    if (res?.status === 404) {
      await db
        .prepare(
          `INSERT INTO owners (owner, sync_status, last_synced_at) VALUES (?, '404', unixepoch())
           ON CONFLICT(owner) DO UPDATE SET sync_status = '404', last_synced_at = unixepoch()`,
        )
        .bind(owner)
        .run()
    }
    return null
  }

  const data = await res.json() as {
    name?: string
    bio?: string
    blog?: string
    location?: string
    followers?: number
    public_repos?: number
    type?: string
  }

  const kind: 'user' | 'org' = data.type === 'Organization' ? 'org' : 'user'
  const row: OwnerRow = {
    kind,
    name: data.name?.trim() || null,
    bio: data.bio?.trim() || null,
    blog: data.blog?.trim() || null,
    location: data.location?.trim() || null,
    followers: data.followers ?? 0,
    last_synced_at: Math.floor(Date.now() / 1000),
    sync_status: 'ok',
  }

  await db
    .prepare(
      `INSERT INTO owners (owner, kind, name, bio, blog, location, followers, public_repos, last_synced_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), 'ok')
       ON CONFLICT(owner) DO UPDATE SET
         kind = excluded.kind, name = excluded.name, bio = excluded.bio, blog = excluded.blog,
         location = excluded.location, followers = excluded.followers, public_repos = excluded.public_repos,
         last_synced_at = excluded.last_synced_at, sync_status = 'ok'`,
    )
    .bind(owner, kind, row.name, row.bio, row.blog, row.location, row.followers, data.public_repos ?? 0)
    .run()

  return row
}

async function loadOwner(owner: string, db: D1Database): Promise<OwnerRow | null> {
  const cached = await db
    .prepare(
      `SELECT kind, name, bio, blog, location, followers, last_synced_at, sync_status
       FROM owners WHERE owner = ?`,
    )
    .bind(owner)
    .first<OwnerRow>()

  const fresh = cached?.last_synced_at != null
    && cached.last_synced_at > Math.floor(Date.now() / 1000) - OWNER_FRESH_HOURS * 3600

  if (cached && fresh)
    return cached.sync_status === '404' ? null : cached

  const fetched = await fetchAndStoreOwner(owner, db)
  return fetched ?? cached ?? null
}

export default defineCachedEventHandler(async (event) => {
  const ownerParam = getRouterParam(event, 'owner')
  if (!ownerParam)
    throw createError({ statusCode: 400, message: 'Missing owner parameter' })

  const owner = ownerParam.toLowerCase()

  const db = getDB(event)
  const [registryResult, ownerRow] = await Promise.all([
    querySkills(event, {
      owner,
      sort: 'installs',
      page: 1,
      limit: 200,
      officialOwners,
    }),
    loadOwner(owner, db),
  ])

  if (registryResult.items.length === 0) {
    throw createError({ statusCode: 404, message: `No skills found for @${owner}` })
  }

  const manifestKind = kindByOwner.get(owner)
  const kind: OrgKind = manifestKind
    ?? (ownerRow?.kind === 'user' ? 'user' : 'org')

  const repoMap = new Map<string, OrgRepo>()
  for (const skill of registryResult.items) {
    const entry = repoMap.get(skill.repo) ?? { repo: skill.repo, count: 0, stars: 0, description: null }
    entry.count++
    if (skill.stars > entry.stars)
      entry.stars = skill.stars
    repoMap.set(skill.repo, entry)
  }
  const repos = [...repoMap.values()].sort((a, b) => b.count - a.count)

  // Pull the actual GitHub repo description (not the top skill's description)
  // for each repo, via ungh.cc which we already use for repo metadata. Cached
  // for 6 hours; misses leave `description` as null.
  await Promise.all(repos.map(async (r) => {
    const cacheKey = `github:repo-desc:${owner}/${r.repo}`
    const cached = await useStorage('cache').getItem<string | null>(cacheKey)
    if (cached) {
      r.description = cached
      return
    }
    const data = await $fetch<{ repo?: { description: string | null } }>(`https://ungh.cc/repos/${owner}/${r.repo}`).catch(() => null)
    const desc = data?.repo?.description?.trim() || null
    await useStorage('cache').setItem(cacheKey, desc, { ttl: 60 * 60 * 6 })
    r.description = desc
  }))

  const tagMap = await getGeneratedBatch<TagPayload>(
    db,
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

  const syncRow = await db
    .prepare(
      `SELECT MAX(last_synced_at) AS last_synced_at,
              SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN sync_status = 'ok' THEN 1 ELSE 0 END) AS ok
       FROM skills WHERE owner = ?`,
    )
    .bind(owner)
    .first<{ last_synced_at: number | null, failed: number | null, ok: number | null }>()

  const lastSyncedAt = syncRow?.last_synced_at ?? null
  let syncStatus: 'ok' | 'failed' | 'never' | null = null
  if (lastSyncedAt == null)
    syncStatus = 'never'
  else if ((syncRow?.failed ?? 0) > 0)
    syncStatus = 'failed'
  else if ((syncRow?.ok ?? 0) > 0)
    syncStatus = 'ok'

  const profile: OrgProfile = {
    owner,
    kind,
    displayName: ownerRow?.name || owner,
    description: ownerRow?.bio ?? null,
    blog: ownerRow?.blog ?? null,
    location: ownerRow?.location ?? null,
    avatar: `https://github.com/${owner}.png`,
    github: `https://github.com/${owner}`,
    followers: ownerRow?.followers ?? 0,
    totalSkills: registryResult.items.length,
    totalStars,
    repos,
    topTags,
    skills: registryResult.items,
    lastSyncedAt,
    syncStatus,
    fetchedAt: new Date().toISOString(),
  }

  return profile
}, {
  maxAge: 60 * 5,
  swr: true,
  getKey: (event) => {
    const owner = getRouterParam(event, 'owner')
    return `org:v4:${(owner || '').toLowerCase()}`
  },
})
