import type { TagPayload } from '../../jobs/generate-tags'
import { defineApiHandler } from '#shared/server/handler'
import { officialRepos } from '../../data/official-repos'
import { FeaturedSkillsQuery } from '../../schemas/featured-query'
import { getGeneratedBatch } from '../../utils/skill-generated'
import { getFeaturedOfficialSections, getTopReposByCount, getTopReposByStars } from '../../utils/skills-registry'

const OWNER_FRESH_SECONDS = 7 * 86400

interface OwnerProfileRow {
  name: string | null
  bio: string | null
  last_synced_at: number | null
  sync_status: string | null
}

async function fetchAndStoreOwner(owner: string, db: D1Database): Promise<OwnerProfileRow | null> {
  const res = await fetch(`https://api.github.com/users/${owner}`, {
    headers: { 'User-Agent': 'skilld.dev', 'Accept': 'application/vnd.github+json' },
  }).catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'featured-owner-fetch', outcome: 'failed' }))
    return null
  })

  if (!res?.ok)
    return null

  const data = await res.json() as {
    name?: string
    bio?: string
    blog?: string
    location?: string
    followers?: number
    public_repos?: number
    type?: string
  }

  const kind = data.type === 'Organization' ? 'org' : 'user'
  await db.prepare(
    `INSERT INTO owners (owner, kind, name, bio, blog, location, followers, public_repos, last_synced_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), 'ok')
     ON CONFLICT(owner) DO UPDATE SET
       kind = excluded.kind, name = excluded.name, bio = excluded.bio, blog = excluded.blog,
       location = excluded.location, followers = excluded.followers, public_repos = excluded.public_repos,
       last_synced_at = excluded.last_synced_at, sync_status = 'ok'`,
  ).bind(
    owner,
    kind,
    data.name?.trim() || null,
    data.bio?.trim() || null,
    data.blog?.trim() || null,
    data.location?.trim() || null,
    data.followers ?? 0,
    data.public_repos ?? 0,
  ).run().catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'featured-owner-cache', outcome: 'failed' }))
  })

  return {
    name: data.name?.trim() || null,
    bio: data.bio?.trim() || null,
    last_synced_at: Math.floor(Date.now() / 1000),
    sync_status: 'ok',
  }
}

async function loadOwnerProfiles(owners: string[], db: D1Database): Promise<Map<string, OwnerProfileRow>> {
  const profiles = new Map<string, OwnerProfileRow>()
  const now = Math.floor(Date.now() / 1000)

  await Promise.all(owners.map(async (owner) => {
    const cached = await db
      .prepare('SELECT name, bio, last_synced_at, sync_status FROM owners WHERE owner = ?')
      .bind(owner)
      .first<OwnerProfileRow>()
      .catch(() => {
        emitOperationalEvent(createWideEvent({ operation: 'featured-owner-cache-read', outcome: 'failed' }))
        return null
      })

    if (cached && cached.sync_status !== '404' && cached.last_synced_at && cached.last_synced_at > now - OWNER_FRESH_SECONDS) {
      profiles.set(owner, cached)
      return
    }
    const fetched = await fetchAndStoreOwner(owner, db)
    if (fetched)
      profiles.set(owner, fetched)
    else if (cached && cached.sync_status !== '404')
      profiles.set(owner, cached)
  }))

  return profiles
}

export default defineApiHandler({
  schema: FeaturedSkillsQuery,
  handler: async ({ event, body, platform }) => {
    const { orgs, perOrg, devs, perDev } = body
    const orgRepos = officialRepos.filter(r => r.kind === 'org')
    const userRepos = officialRepos.filter(r => r.kind === 'user')

    const [featuredOrgs, featuredDevs] = await Promise.all([
      orgs > 0 ? getTopReposByCount(event, orgRepos, orgs) : Promise.resolve([]),
      devs > 0 ? getTopReposByStars(event, userRepos, devs) : Promise.resolve([]),
    ])

    const [sections, devSections] = await Promise.all([
      getFeaturedOfficialSections(event, featuredOrgs, perOrg),
      getFeaturedOfficialSections(event, featuredDevs, perDev),
    ])

    const allKeys = [...sections, ...devSections].flatMap(s => s.skills.map(sk => ({ owner: sk.owner, repo: sk.repo, name: sk.name })))
    const tagMap = await getGeneratedBatch<TagPayload>(platform.db, allKeys, 'tags')

    const enrichSkills = (section: typeof sections[number]) => ({
      ...section,
      skills: section.skills.map(skill => ({
        ...skill,
        tags: tagMap.get(`${skill.owner}/${skill.repo}/${skill.name}`)?.payload.tags ?? [],
      })),
    })

    const profileMap = await loadOwnerProfiles(devSections.map(s => s.owner), platform.db)
    const enriched = sections.map(enrichSkills)
    const enrichedDevs = devSections.map((section) => {
      const profile = profileMap.get(section.owner)
      return {
        ...enrichSkills(section),
        displayName: profile?.name || section.owner,
        description: profile?.bio ?? null,
      }
    })

    return { sections: enriched, devSections: enrichedDevs }
  },
})
