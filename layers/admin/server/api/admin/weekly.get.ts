/// <reference types="@cloudflare/workers-types" />

/**
 * What the weekly email did, and who it would reach next.
 *
 * The cron writes one `weekly_runs` row per person per week, which answers
 * "did the provider accept it" but not "was it worth sending". This reports the audience,
 * the last few windows, and every unresolved row, since a
 * silent failure and a quiet week look identical from the outside.
 */

import { loadWeeklyRecipients } from '#layers/identity/server/utils/weekly-select'
import { defineApiHandler } from '#shared/server/handler'
import { summarizeWeeklyEngagement } from '../../utils/weekly-engagement'

interface WindowRow {
  window_start: number
  window_end: number
  recipients: number
  accepted: number
  skipped: number
  failed: number
  unresolved: number
  liked_rows: number
  trending_rows: number
  first_claimed_at: number
  last_sent_at: number | null
  unique_clicks: number
  unsubscribes: number
  share_intents: number
}

interface ProblemRow {
  login: string
  window_end: number
  status: string
  error: string | null
}

export interface AdminWeeklyResponse {
  audience: {
    /** Accounts that would be mailed if the task ran now. */
    reachable: number
    /** Accounts holding an address but opted out. */
    optedOut: number
    /** Accounts with no address to mail. */
    noAddress: number
  }
  windows: Array<{
    windowStart: number
    windowEnd: number
    recipients: number
    accepted: number
    skipped: number
    failed: number
    unresolved: number
    likedRows: number
    trendingRows: number
    firstClaimedAt: number
    lastAcceptedAt: number | null
    uniqueClicks: number
    uniqueClickRate: number | null
    unsubscribes: number
    unsubscribeRate: number | null
    shareIntents: number
  }>
  /** Rows without a resolved provider outcome, newest first. */
  problems: Array<{
    login: string
    windowEnd: number
    status: string
    error: string | null
  }>
}

export default defineApiHandler({
  handler: async ({ event, platform }): Promise<AdminWeeklyResponse> => {
    await requireAdmin(event)
    const db = platform.db

    const hasAddress = `TRIM(COALESCE(digest_email, COALESCE(email, ''))) != ''`
    const [recipients, audience, windows, problems] = await Promise.all([
      loadWeeklyRecipients(db),
      db.prepare(
        `SELECT
           SUM(weekly_opt_out = 1 AND ${hasAddress}) AS opted_out,
           SUM(NOT ${hasAddress}) AS no_address
         FROM users`,
      ).first<{ opted_out: number, no_address: number }>(),

      db.prepare(
        `SELECT window_start, window_end,
                COUNT(*) AS recipients,
                SUM(provider_status = 'accepted' OR (status = 'sent' AND provider_status IS NULL)) AS accepted,
                SUM(status = 'skipped') AS skipped,
                SUM(status = 'failed') AS failed,
                SUM(status IN ('uncertain', 'claimed')) AS unresolved,
                SUM(liked_count) AS liked_rows,
                SUM(trending_count) AS trending_rows,
                MIN(claimed_at) AS first_claimed_at,
                MAX(r.sent_at) AS last_sent_at,
                (SELECT COUNT(DISTINCT c.user_id)
                 FROM weekly_click_events c
                 WHERE c.window_end = r.window_end
                   AND c.user_id IS NOT NULL
                   AND c.placement != 'share') AS unique_clicks,
                (SELECT COUNT(DISTINCT e.user_id)
                 FROM email_preference_events e
                 WHERE e.list = 'weekly'
                   AND e.action = 'unsubscribed'
                   AND EXISTS (
                     SELECT 1 FROM weekly_runs er
                     WHERE er.window_end = r.window_end
                       AND er.user_id = e.user_id
                       AND er.sent_at IS NOT NULL
                       AND e.occurred_at >= er.sent_at
                       AND e.occurred_at < er.sent_at + 604800
                   )) AS unsubscribes,
                (SELECT COUNT(DISTINCT c.user_id)
                 FROM weekly_click_events c
                 WHERE c.window_end = r.window_end
                   AND c.user_id IS NOT NULL
                   AND c.placement = 'share') AS share_intents
         FROM weekly_runs r
         GROUP BY r.window_end
         ORDER BY r.window_end DESC
         LIMIT 8`,
      ).all<WindowRow>(),

      // 'claimed' counts as a problem: a row claimed and never resolved means
      // the run died mid-pass, and the unique index stops it being retried.
      db.prepare(
        `SELECT u.login, r.window_end, r.status, r.error
         FROM weekly_runs r
         JOIN users u ON u.id = r.user_id
         WHERE r.status IN ('failed', 'uncertain', 'claimed')
         ORDER BY r.window_end DESC, u.login ASC
         LIMIT 50`,
      ).all<ProblemRow>(),
    ])

    return {
      audience: {
        reachable: recipients.length,
        optedOut: audience?.opted_out ?? 0,
        noAddress: audience?.no_address ?? 0,
      },
      windows: (windows.results ?? []).map(row => ({
        windowStart: row.window_start,
        windowEnd: row.window_end,
        recipients: row.recipients,
        accepted: row.accepted,
        skipped: row.skipped,
        failed: row.failed,
        unresolved: row.unresolved,
        likedRows: row.liked_rows,
        trendingRows: row.trending_rows,
        firstClaimedAt: row.first_claimed_at,
        lastAcceptedAt: row.last_sent_at,
        ...summarizeWeeklyEngagement(row),
      })),
      problems: (problems.results ?? []).map(row => ({
        login: row.login,
        windowEnd: row.window_end,
        status: row.status,
        error: row.error,
      })),
    }
  },
})
