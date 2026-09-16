/// <reference types="@cloudflare/workers-types" />

const DAY_SECONDS = 24 * 60 * 60

/**
 * How long skilld.dev keeps records that name an account after they stop
 * doing their job. Privacy is a product rule: a record with no further use is
 * deleted, not archived.
 */
export const RETENTION_SECONDS = {
  /** A revoked or expired CLI token stays visible on /me/devices for a week. */
  endedCliToken: 7 * DAY_SECONDS,
  /** Sign-in codes and device sessions expire within ten minutes. */
  cliSignIn: DAY_SECONDS,
  /** Delivery history and preference changes support three months of reporting. */
  emailHistory: 90 * DAY_SECONDS,
} as const

export interface RetentionPurgeResult {
  cliTokens: number
  cliAuthCodes: number
  cliDeviceSessions: number
  digestRuns: number
  weeklyRuns: number
  emailPreferenceEvents: number
}

/**
 * Delete personal records that are past their retention window.
 *
 * Each statement is idempotent, so a retried run deletes nothing twice.
 * Digest runs are the one exception to a plain age cut: the newest sent or
 * skipped run per account holds the cursor for the next digest, and an
 * unresolved run still waits for a retry, so both stay.
 */
export async function purgeRetainedPersonalData(
  db: D1Database,
  now: number,
): Promise<RetentionPurgeResult> {
  const endedTokenCutoff = now - RETENTION_SECONDS.endedCliToken
  const signInCutoff = now - RETENTION_SECONDS.cliSignIn
  const historyCutoff = now - RETENTION_SECONDS.emailHistory

  const results = await db.batch([
    db.prepare(
      `DELETE FROM cli_tokens
       WHERE revoked_at <= ?1
          OR expires_at <= ?1`,
    ).bind(endedTokenCutoff),
    db.prepare(`DELETE FROM cli_auth_codes WHERE created_at <= ?1`).bind(signInCutoff),
    db.prepare(`DELETE FROM cli_device_sessions WHERE created_at <= ?1`).bind(signInCutoff),
    db.prepare(
      `DELETE FROM digest_runs
       WHERE window_end <= ?1
         AND status IN ('sent', 'skipped')
         AND window_end < (
           SELECT MAX(latest.window_end)
           FROM digest_runs AS latest
           WHERE latest.user_id = digest_runs.user_id
             AND latest.status IN ('sent', 'skipped')
         )`,
    ).bind(historyCutoff),
    db.prepare(`DELETE FROM weekly_runs WHERE window_end <= ?1`).bind(historyCutoff),
    db.prepare(`DELETE FROM email_preference_events WHERE occurred_at <= ?1`).bind(historyCutoff),
  ])

  const changes = results.map(result => result.meta.changes)
  return {
    cliTokens: changes[0] ?? 0,
    cliAuthCodes: changes[1] ?? 0,
    cliDeviceSessions: changes[2] ?? 0,
    digestRuns: changes[3] ?? 0,
    weeklyRuns: changes[4] ?? 0,
    emailPreferenceEvents: changes[5] ?? 0,
  }
}
