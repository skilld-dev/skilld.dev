/**
 * Follow-graph cache backed by D1.
 *
 * Bluesky's getFollows is paginated (100/page). For users with many follows
 * that's a round-trip storm on every homepage hit, so we cache the full set
 * in `follows_cache` and refresh in the background. Refresh is gated per
 * follower by `follows_refresh_state.next_eligible_at` (15 min rate limit).
 *
 * `app.bsky.graph.getFollows` is a public AppView call, so the background
 * refresh task does not need OAuth restoration.
 */

/// <reference types="@cloudflare/workers-types" />
import type { Agent } from '@atproto/api'

const RATE_LIMIT_MS = 15 * 60 * 1000
const STALENESS_MS = 60 * 60 * 1000

export interface FollowsCacheState {
  followedDids: string[]
  refreshedAt: number | null
  isStale: boolean
  isMissing: boolean
}

const nowSec = () => Math.floor(Date.now() / 1000)

/** Page through every follow for a DID. */
export async function fetchAllFollows(agent: Agent, did: string): Promise<string[]> {
  const dids: string[] = []
  let cursor: string | undefined
  do {
    const res = await agent.getFollows({ actor: did, limit: 100, cursor })
    for (const follow of res.data.follows)
      dids.push(follow.did)
    cursor = res.data.cursor
  } while (cursor)
  return dids
}

/** Read the cached follow set + refresh state for a follower. */
export async function getFollowsCache(db: D1Database, followerDid: string): Promise<FollowsCacheState> {
  const [followsRes, stateRes] = await db.batch([
    db.prepare('SELECT followed_did FROM follows_cache WHERE follower_did = ?').bind(followerDid),
    db.prepare('SELECT refreshed_at FROM follows_refresh_state WHERE follower_did = ?').bind(followerDid),
  ]) as [D1Result<{ followed_did: string }>, D1Result<{ refreshed_at: number }>]

  const followedDids = (followsRes.results ?? []).map(r => r.followed_did)
  const refreshedAt = stateRes.results[0]?.refreshed_at ?? null
  const isMissing = refreshedAt === null
  const isStale = refreshedAt === null || (nowSec() - refreshedAt) * 1000 > STALENESS_MS

  return { followedDids, refreshedAt, isStale, isMissing }
}

/** Replace the cached follow set + bump refresh state in one batch. */
export async function writeFollowsCache(
  db: D1Database,
  followerDid: string,
  followedDids: string[],
) {
  const now = nowSec()
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM follows_cache WHERE follower_did = ?').bind(followerDid),
  ]

  const CHUNK = 50
  for (let i = 0; i < followedDids.length; i += CHUNK) {
    const chunk = followedDids.slice(i, i + CHUNK)
    const placeholders = chunk.map(() => '(?, ?, ?)').join(', ')
    const binds: (string | number)[] = []
    for (const d of chunk)
      binds.push(followerDid, d, now)
    stmts.push(
      db.prepare(`INSERT INTO follows_cache (follower_did, followed_did, cached_at) VALUES ${placeholders}`)
        .bind(...binds),
    )
  }

  stmts.push(
    db.prepare(`
      INSERT INTO follows_refresh_state (follower_did, refreshed_at, next_eligible_at)
      VALUES (?, ?, ?)
      ON CONFLICT(follower_did) DO UPDATE SET
        refreshed_at = excluded.refreshed_at,
        next_eligible_at = excluded.next_eligible_at
    `).bind(followerDid, now, now + Math.floor(RATE_LIMIT_MS / 1000)),
  )

  await db.batch(stmts)
}

/** True when refresh-rate window has elapsed (or no row exists yet). */
export async function canRefreshFollows(db: D1Database, followerDid: string): Promise<boolean> {
  const row = await db.prepare(
    'SELECT next_eligible_at FROM follows_refresh_state WHERE follower_did = ?',
  ).bind(followerDid).first<{ next_eligible_at: number }>()
  if (!row)
    return true
  return nowSec() >= row.next_eligible_at
}

/** Refresh the follow cache for a follower from a live AT Protocol agent. */
export async function refreshFollowsCache(db: D1Database, agent: Agent, followerDid: string) {
  const dids = await fetchAllFollows(agent, followerDid)
  await writeFollowsCache(db, followerDid, dids)
  return dids
}

/**
 * Followers due for cron refresh: rate-limit cleared AND staleness threshold passed.
 * Stalest first so the worst-out-of-date users get prioritized.
 */
export async function getStaleFollowers(
  db: D1Database,
  opts: { staleAfterMs: number, limit: number },
): Promise<string[]> {
  const now = nowSec()
  const staleBefore = now - Math.floor(opts.staleAfterMs / 1000)
  const res = await db.prepare(`
    SELECT follower_did FROM follows_refresh_state
    WHERE next_eligible_at <= ? AND refreshed_at < ?
    ORDER BY refreshed_at ASC
    LIMIT ?
  `).bind(now, staleBefore, opts.limit).all<{ follower_did: string }>()
  return (res.results ?? []).map(r => r.follower_did)
}

export const FOLLOWS_RATE_LIMIT_MS = RATE_LIMIT_MS
export const FOLLOWS_STALENESS_MS = STALENESS_MS
