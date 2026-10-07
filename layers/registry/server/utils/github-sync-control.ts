/// <reference types="@cloudflare/workers-types" />

export type GithubSyncPermit
  = | { _tag: 'allowed' }
    | { _tag: 'paused', retryAfterSeconds: number, reason: string | null }

export type GithubSyncPauseDecision
  = | { _tag: 'continue' }
    | { _tag: 'pause', pauseUntil: number, reason: string }

interface GithubSyncControlRow {
  pause_until: number | null
  reason: string | null
}

export async function githubSyncPermit(
  db: D1Database,
  now: number,
): Promise<GithubSyncPermit> {
  const row = await db.prepare(
    `SELECT pause_until, reason
     FROM github_sync_control
     WHERE id = 1`,
  ).first<GithubSyncControlRow>()
  if (!row?.pause_until || row.pause_until <= now)
    return { _tag: 'allowed' }
  return {
    _tag: 'paused',
    retryAfterSeconds: Math.max(60, row.pause_until - now + 5),
    reason: row.reason,
  }
}

export async function pauseGithubSync(
  db: D1Database,
  input: { pauseUntil: number, reason: string, now: number },
): Promise<void> {
  await db.prepare(
    `INSERT INTO github_sync_control (id, pause_until, reason, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       pause_until = MAX(COALESCE(github_sync_control.pause_until, 0), excluded.pause_until),
       reason = CASE
         WHEN excluded.pause_until >= COALESCE(github_sync_control.pause_until, 0)
           THEN excluded.reason
         ELSE github_sync_control.reason
       END,
       updated_at = excluded.updated_at`,
  ).bind(input.pauseUntil, input.reason, input.now).run()
}

export function githubRatePauseUntil(
  now: number,
  resetAt: number | undefined,
): number {
  const fallback = now + 15 * 60
  return Math.min(now + 12 * 60 * 60, Math.max(fallback, (resetAt ?? 0) + 5))
}

/**
 * Requests the sync leaves unspent in a GitHub bucket before it pauses.
 *
 * Sync and page views share the read App installation's bucket. The sync
 * spends about 10 REST requests and 130 GraphQL points an hour, and page
 * views about 50 REST requests at most. 200 covers page views for the rest
 * of any hour once the sync stops.
 */
export const GITHUB_SYNC_RESERVE = 200

export function githubSyncPauseDecision(input: {
  owner: string
  repo: string
  now: number
  remaining?: number
  /** The bucket `remaining` counts, from `x-ratelimit-resource`. */
  resource?: string
  resetAt?: number
  rateLimited: boolean
  unauthorized: boolean
}): GithubSyncPauseDecision {
  if (input.unauthorized) {
    return {
      _tag: 'pause',
      pauseUntil: input.now + 15 * 60,
      reason: `${input.owner}/${input.repo}: GitHub credential rejected`,
    }
  }
  if (!input.rateLimited && (input.remaining == null || input.remaining >= GITHUB_SYNC_RESERVE))
    return { _tag: 'continue' }
  const bucket = input.resource ? `${input.resource} ` : ''
  return {
    _tag: 'pause',
    pauseUntil: githubRatePauseUntil(input.now, input.resetAt),
    reason: `${input.owner}/${input.repo}: ${input.rateLimited ? 'rate limited' : `${input.remaining} ${bucket}requests remaining`}`,
  }
}
