/**
 * Network feed: skills picked by the @handles the viewer follows on Bluesky.
 *
 * Single denormalized join across follows_cache × collections × collection_skills × curators.
 * Soft-deleted collections (deleted_at) are filtered. App layer dedupes by skill,
 * keeping up to MAX_CURATORS_PER_SKILL most-recent pickers per skill.
 *
 * PRIVACY (P0): only `dev.skilld.collection` records are joined. Save records
 * (`dev.skilld.collection.save`) are never read. Enforced by
 * `scripts/check-saves-isolation.ts`.
 */

import { getAuthenticatedAgent } from '../../utils/atproto/agent'
import { getFollowsCache, refreshFollowsCache } from '../../utils/atproto/follows'

const QUERY_LIMIT = 200
const RESPONSE_LIMIT = 50
const MAX_CURATORS_PER_SKILL = 3

interface FeedRow {
  package_name: string
  owner: string | null
  repo: string | null
  reason: string | null
  collection_uri: string
  collection_slug: string
  collection_name: string
  curator_did: string
  curator_handle: string
  curator_display_name: string | null
  curator_avatar: string | null
  picked_at: number
}

interface NetworkFeedSkill {
  packageName: string
  owner: string | null
  repo: string | null
  pickedAt: string
  curators: Array<{
    did: string
    handle: string
    displayName: string | null
    avatar: string | null
    reason: string | null
    collection: { uri: string, slug: string, name: string }
    pickedAt: string
  }>
}

export default defineCachedEventHandler(async (event) => {
  const { agent, did } = await getAuthenticatedAgent(event)
  const db = getDB(event)

  let { followedDids, isMissing } = await getFollowsCache(db, did)
  if (isMissing) {
    followedDids = await refreshFollowsCache(db, agent, did)
  }

  if (!followedDids.length) {
    return {
      skills: [] as NetworkFeedSkill[],
      total: 0,
      followCount: 0,
      generatedAt: new Date().toISOString(),
    }
  }

  const t0 = Date.now()
  const res = await db.prepare(`
    SELECT
      cs.package_name,
      cs.owner,
      cs.repo,
      cs.reason,
      c.uri          AS collection_uri,
      c.slug         AS collection_slug,
      c.name         AS collection_name,
      c.did          AS curator_did,
      cu.handle      AS curator_handle,
      cu.display_name AS curator_display_name,
      cu.avatar      AS curator_avatar,
      c.updated_at   AS picked_at
    FROM follows_cache f
    JOIN collections        c  ON c.did = f.followed_did AND c.deleted_at IS NULL
    JOIN collection_skills  cs ON cs.collection_uri = c.uri
    JOIN curators           cu ON cu.did = c.did
    WHERE f.follower_did = ?
    ORDER BY c.updated_at DESC
    LIMIT ?
  `).bind(did, QUERY_LIMIT).all<FeedRow>()

  const queryMs = Date.now() - t0
  if (queryMs > 300)
    console.warn(`[network-feed] Slow query: ${queryMs}ms for ${did} (${followedDids.length} follows)`)

  // Dedup by skill identity (package_name + owner + repo).
  // Most-recent picker per skill leads; subsequent pickers fill the curator list.
  const bySkill = new Map<string, NetworkFeedSkill>()
  for (const row of res.results ?? []) {
    const key = `${row.package_name}::${row.owner ?? ''}::${row.repo ?? ''}`
    const pickedIso = new Date(row.picked_at * 1000).toISOString()
    const curatorEntry = {
      did: row.curator_did,
      handle: row.curator_handle,
      displayName: row.curator_display_name,
      avatar: row.curator_avatar,
      reason: row.reason,
      collection: {
        uri: row.collection_uri,
        slug: row.collection_slug,
        name: row.collection_name,
      },
      pickedAt: pickedIso,
    }

    const existing = bySkill.get(key)
    if (!existing) {
      bySkill.set(key, {
        packageName: row.package_name,
        owner: row.owner,
        repo: row.repo,
        pickedAt: pickedIso,
        curators: [curatorEntry],
      })
      continue
    }

    if (existing.curators.length < MAX_CURATORS_PER_SKILL
      && !existing.curators.some(c => c.did === row.curator_did)) {
      existing.curators.push(curatorEntry)
    }
  }

  const skills = [...bySkill.values()]
    .sort((a, b) => b.pickedAt.localeCompare(a.pickedAt))
    .slice(0, RESPONSE_LIMIT)

  return {
    skills,
    total: skills.length,
    followCount: followedDids.length,
    generatedAt: new Date().toISOString(),
  }
}, {
  maxAge: 60,
  swr: true,
  getKey: async (event) => {
    const session = await getUserSession(event)
    const did = session.data?.public?.did as string | undefined
    return `feed:network:${did ?? 'anon'}`
  },
})
