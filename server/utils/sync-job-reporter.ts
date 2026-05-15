/// <reference types="@cloudflare/workers-types" />

/**
 * sync_jobs registry helper. Tasks call `reportJobRun` on completion (success
 * or failure) so /admin/integrity can surface last-run, status, and duration
 * without needing direct access to Cloudflare cron telemetry.
 *
 * The reporter is self-registering: the first call for a given job name will
 * INSERT OR IGNORE a row with the supplied static metadata (cron expression,
 * stale_after_seconds). Tasks added later don't need a separate seed step.
 */

export type JobStatus = 'ok' | 'error' | 'partial'

export interface ReportJobRunInput {
  /** Cron expression this job is scheduled under (matches nuxt.config.ts). */
  cron: string
  /** Outcome of this run. */
  status: JobStatus
  /** Wall-clock duration in ms. */
  durationMs: number
  /** Free-form error message when status='error' or 'partial'. */
  error?: string | null
  /**
   * Optional. Threshold used to flag this job as stalled in /admin/integrity
   * when distinct from the cron cadence. Defaults to 2x the cron interval at
   * read time when null.
   */
  staleAfterSeconds?: number | null
  /** Optional override; defaults to 1. */
  enabled?: boolean
}

export async function reportJobRun(
  db: D1Database,
  name: string,
  input: ReportJobRunInput,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const enabled = input.enabled === false ? 0 : 1

  // Self-register on first run. Static metadata only — the running row is
  // updated by the UPDATE below.
  await db
    .prepare(
      `INSERT OR IGNORE INTO sync_jobs (name, cron, enabled, stale_after_seconds)
       VALUES (?1, ?2, ?3, ?4)`,
    )
    .bind(name, input.cron, enabled, input.staleAfterSeconds ?? null)
    .run()

  await db
    .prepare(
      `UPDATE sync_jobs
       SET cron = ?2,
           enabled = ?3,
           stale_after_seconds = COALESCE(?4, stale_after_seconds),
           last_run_at = ?5,
           last_status = ?6,
           last_error = ?7,
           last_duration_ms = ?8,
           run_count = run_count + 1
       WHERE name = ?1`,
    )
    .bind(
      name,
      input.cron,
      enabled,
      input.staleAfterSeconds ?? null,
      now,
      input.status,
      input.error ?? null,
      Math.max(0, Math.floor(input.durationMs)),
    )
    .run()
}
