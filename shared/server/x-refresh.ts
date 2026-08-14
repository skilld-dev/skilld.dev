/**
 * Re-read engagement for posts we already hold, so trending can measure
 * velocity rather than a lifetime total.
 *
 * This is the CHEAP half of the feature, which is the opposite of what it
 * looks like. Pay-per-use deduplicates reads of the same post within a UTC
 * day, and discovery already paid for each post's first read, so re-reading a
 * post on the same day costs nothing. Refresh is only charged when a post's
 * hot window crosses midnight UTC.
 *
 * Discovery is the expensive half: every post the search matches is a first
 * read at $0.005. Its budget lives in `x-ingest.ts`.
 *
 * Two guards remain here:
 *
 *   1. `maxPostsPerRun` bounds work per run, so a backlog cannot blow the
 *      Worker CPU budget. It is no longer a spend control.
 *   2. Posts the API no longer returns are frozen immediately. A deleted post
 *      would otherwise be re-requested on its schedule forever.
 */

import type { RefreshPolicyConfig } from '#shared/x-refresh-policy'
import type { XClient, XError } from './x-client'
import { DEFAULT_REFRESH_POLICY, planRefresh } from '#shared/x-refresh-policy'
import { X_LOOKUP_BATCH_SIZE } from './x-client'

/**
 * Posts handled per run. A work bound, not a spend bound: re-reads inside a
 * UTC day are free, so this only keeps one run inside a Worker's CPU budget.
 */
export const DEFAULT_MAX_POSTS_PER_RUN = 600

/** Snapshots older than this are pruned, never the most recent one. */
const METRIC_RETENTION_DAYS = 30

export interface XRefreshDeps {
  db: D1Database
  client: XClient
  /** Unix seconds. */
  now: number
  maxPostsPerRun?: number
  policy?: RefreshPolicyConfig
}

export interface XRefreshSummary {
  claimed: number
  refreshed: number
  /** Requested but not returned by the API: deleted, or made private. */
  vanished: number
  promotedToHot: number
  frozen: number
  postsRead: number
  snapshotsPruned: number
  error: XError | null
  elapsedMs: number
}

interface ClaimedRow {
  post_id: string
  posted_at: number
  favourite_count: number
  repost_count: number
  reply_count: number
  quote_count: number
  bookmark_count: number
  metrics_updated_at: number
}

const FROZEN_SENTINEL_SECONDS = 365 * 24 * 60 * 60

export async function refreshXEngagement(deps: XRefreshDeps): Promise<XRefreshSummary> {
  const startedAt = Date.now()
  const { db, client, now } = deps
  const policy = deps.policy ?? DEFAULT_REFRESH_POLICY
  const budget = deps.maxPostsPerRun ?? DEFAULT_MAX_POSTS_PER_RUN

  const summary: XRefreshSummary = {
    claimed: 0,
    refreshed: 0,
    vanished: 0,
    promotedToHot: 0,
    frozen: 0,
    postsRead: 0,
    snapshotsPruned: 0,
    error: null,
    elapsedMs: 0,
  }

  const claimed = await db
    .prepare(
      `SELECT post_id, posted_at, favourite_count, repost_count, reply_count,
              quote_count, bookmark_count, metrics_updated_at
       FROM x_posts
       -- Platform predicate is load-bearing, not defensive. This task posts
       -- claimed ids to the X lookup endpoint, where every returned object is
       -- charged against the monthly cap. A Bluesky AT-URI sent there is a
       -- guaranteed miss that still costs a request, and because a miss never
       -- updates the row it would be re-claimed on every single run.
       WHERE platform = 'x' AND refresh_tier != 'frozen' AND next_refresh_at <= ?1
       ORDER BY refresh_tier ASC, next_refresh_at ASC
       LIMIT ?2`,
    )
    .bind(now, budget)
    .all<ClaimedRow>()

  const rows = claimed.results ?? []
  summary.claimed = rows.length
  if (rows.length === 0) {
    summary.elapsedMs = Date.now() - startedAt
    return summary
  }

  const byId = new Map(rows.map(r => [r.post_id, r]))

  for (let i = 0; i < rows.length; i += X_LOOKUP_BATCH_SIZE) {
    const batch = rows.slice(i, i + X_LOOKUP_BATCH_SIZE)
    const result = await client.lookupPosts(batch.map(r => r.post_id))

    if (result._tag === 'err') {
      // Stop on the first failure. Unclaimed posts keep their existing
      // next_refresh_at, so the following run picks up exactly where this one
      // stopped without re-reading anything already updated.
      summary.error = result.error
      break
    }

    summary.postsRead += result.value.postsRead
    const returned = new Set<string>()
    const statements: D1PreparedStatement[] = []

    for (const fresh of result.value.posts) {
      const previous = byId.get(fresh.id)
      if (!previous)
        continue
      returned.add(fresh.id)

      const plan = planRefresh({ postedAt: previous.posted_at }, now, policy)

      if (plan.tier === 'hot')
        summary.promotedToHot += 1
      else
        summary.frozen += 1

      summary.refreshed += 1

      statements.push(
        db.prepare(
          `INSERT OR REPLACE INTO x_post_metrics (
             post_id, observed_at, favourite_count, repost_count, reply_count,
             quote_count, bookmark_count, impression_count
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        ).bind(
          fresh.id,
          now,
          fresh.metrics.favouriteCount,
          fresh.metrics.repostCount,
          fresh.metrics.replyCount,
          fresh.metrics.quoteCount,
          fresh.metrics.bookmarkCount,
          fresh.metrics.impressionCount,
        ),
        db.prepare(
          `UPDATE x_posts SET
             favourite_count = ?2, repost_count = ?3, reply_count = ?4,
             quote_count = ?5, bookmark_count = ?6, impression_count = ?7,
             metrics_updated_at = ?8, refresh_tier = ?9, next_refresh_at = ?10
           WHERE post_id = ?1`,
        ).bind(
          fresh.id,
          fresh.metrics.favouriteCount,
          fresh.metrics.repostCount,
          fresh.metrics.replyCount,
          fresh.metrics.quoteCount,
          fresh.metrics.bookmarkCount,
          fresh.metrics.impressionCount,
          now,
          plan.tier,
          plan.nextRefreshAt,
        ),
      )
    }

    // Anything requested and not returned is gone. Freezing it keeps the row
    // and its last known counts for display, and stops paying to ask again.
    for (const row of batch) {
      if (returned.has(row.post_id))
        continue
      summary.vanished += 1
      summary.frozen += 1
      statements.push(
        db.prepare(
          `UPDATE x_posts SET refresh_tier = 'frozen', next_refresh_at = ?2 WHERE post_id = ?1`,
        ).bind(row.post_id, now + FROZEN_SENTINEL_SECONDS),
      )
    }

    if (statements.length > 0)
      await db.batch(statements)
  }

  summary.snapshotsPruned = await pruneSnapshots(db, now)
  summary.elapsedMs = Date.now() - startedAt
  return summary
}

/**
 * Drop snapshots past the retention window, but only for posts that still
 * have a recent one. Without that guard a long-frozen post would lose its
 * final observation and disappear from any historical view.
 */
async function pruneSnapshots(db: D1Database, now: number): Promise<number> {
  const cutoff = now - METRIC_RETENTION_DAYS * 24 * 3600
  const result = await db
    .prepare(
      `DELETE FROM x_post_metrics
       WHERE observed_at < ?1
         AND post_id IN (SELECT post_id FROM x_post_metrics WHERE observed_at >= ?1)`,
    )
    .bind(cutoff)
    .run()
  return (result.meta as { changes?: number } | undefined)?.changes ?? 0
}
