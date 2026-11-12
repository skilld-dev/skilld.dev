/// <reference types="@cloudflare/workers-types" />

/**
 * How long a finished durable job row is kept.
 *
 * `completeJob` in nuxt-cf-jobs is a soft complete: the `jobs` row stays with
 * its payload, `retry_reasons`, and `last_error`. The daily check-in reads a
 * day or a week back, so seven days keeps every row it can ask for.
 *
 * Measured 2026-11-12: `jobs` held 146,816 rows, `failed_jobs` 2,672, and
 * `job_batches` 3,332, from an hourly sync that writes up to 250 job rows
 * and one batch row. Nothing deleted any of them.
 */
export const COMPLETED_JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60

/**
 * Failed jobs are the only evidence of a permanent repository failure once
 * `repo_sync_progress` is cleared, so they stay longer than completed ones.
 */
export const FAILED_JOB_RETENTION_SECONDS = 30 * 24 * 60 * 60

/**
 * Embedding attempts are provider evidence for one Vectorize upsert. The
 * parity audit reads only the current `skill_generated` marker, so the
 * attempt row matters for triage of a recent failure and nothing else.
 */
export const EMBEDDING_ATTEMPT_RETENTION_SECONDS = 30 * 24 * 60 * 60

/**
 * Rows one DELETE may remove. The subquery seeks an index, and 500 rows keep
 * each statement well under D1's row budget.
 */
export const FINISHED_JOB_PRUNE_BATCH = 500

/**
 * DELETE statements one run may issue per table. Steady state needs one or
 * two; the cap only binds while a backlog drains, and it keeps a run inside
 * its scheduled runtime.
 */
export const FINISHED_JOB_PRUNE_MAX_BATCHES = 40

export interface FinishedJobPruneReport {
  completedJobs: number
  failedJobs: number
  finishedBatches: number
  embeddingAttempts: number
  /** True when a table still had a full batch to delete when the cap bound. */
  truncated: boolean
}

/**
 * Finished job rows nothing needs any more.
 *
 * The predicates match nuxt-cf-jobs's own prune methods: a member of a batch
 * stays while its batch is unfinished, and a batch stays while any job still
 * names it. Member rows go before their batches, so the batch delete never
 * violates the `jobs.batch_id` foreign key.
 */
const DELETE_COMPLETED_JOBS = `
  DELETE FROM jobs WHERE id IN (
    SELECT id FROM jobs INDEXED BY idx_jobs_completed_at
    WHERE completed_at IS NOT NULL
      AND completed_at <= ?
      AND (
        batch_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM job_batches
          WHERE job_batches.id = jobs.batch_id AND job_batches.finished_at IS NULL
        )
      )
    LIMIT ?
  )
`

const DELETE_FAILED_JOBS = `
  DELETE FROM failed_jobs WHERE id IN (
    SELECT id FROM failed_jobs INDEXED BY idx_failed_jobs_failed_at
    WHERE failed_at <= ?
      AND (
        batch_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM job_batches
          WHERE job_batches.id = failed_jobs.batch_id AND job_batches.finished_at IS NULL
        )
      )
    LIMIT ?
  )
`

const DELETE_FINISHED_BATCHES = `
  DELETE FROM job_batches WHERE id IN (
    SELECT id FROM job_batches INDEXED BY idx_job_batches_finished_at
    WHERE finished_at IS NOT NULL
      AND finished_at <= ?
      AND NOT EXISTS (SELECT 1 FROM jobs WHERE jobs.batch_id = job_batches.id)
      AND NOT EXISTS (SELECT 1 FROM failed_jobs WHERE failed_jobs.batch_id = job_batches.id)
      AND (
        parent_batch_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM job_batches parent
          WHERE parent.id = job_batches.parent_batch_id AND parent.finished_at IS NULL
        )
      )
    LIMIT ?
  )
`

/**
 * A started attempt older than the window is one the Worker never finished,
 * so it is as settled as a terminal one.
 */
const DELETE_EMBEDDING_ATTEMPTS = `
  DELETE FROM embedding_attempts WHERE attempt_id IN (
    SELECT attempt_id FROM embedding_attempts
    WHERE started_at <= ?
    LIMIT ?
  )
`

async function deleteInBatches(
  db: D1Database,
  sql: string,
  cutoff: number,
  limit: number,
  maxBatches: number,
): Promise<{ deleted: number, truncated: boolean }> {
  let deleted = 0
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await db.prepare(sql).bind(cutoff, limit).run()
    const changes = result.meta.changes ?? 0
    deleted += changes
    if (changes < limit)
      return { deleted, truncated: false }
  }
  return { deleted, truncated: true }
}

/**
 * Delete finished durable job rows and old embedding attempts, in bounded
 * batches. Returns how many rows each table lost.
 */
export async function pruneFinishedJobs(
  db: D1Database,
  input: {
    now: number
    limit?: number
    maxBatches?: number
    completedRetentionSeconds?: number
    failedRetentionSeconds?: number
    embeddingAttemptRetentionSeconds?: number
  },
): Promise<FinishedJobPruneReport> {
  const limit = input.limit ?? FINISHED_JOB_PRUNE_BATCH
  const maxBatches = input.maxBatches ?? FINISHED_JOB_PRUNE_MAX_BATCHES
  const completedCutoff = input.now - (input.completedRetentionSeconds ?? COMPLETED_JOB_RETENTION_SECONDS)
  const failedCutoff = input.now - (input.failedRetentionSeconds ?? FAILED_JOB_RETENTION_SECONDS)
  const attemptCutoff = input.now - (input.embeddingAttemptRetentionSeconds ?? EMBEDDING_ATTEMPT_RETENTION_SECONDS)

  const completed = await deleteInBatches(db, DELETE_COMPLETED_JOBS, completedCutoff, limit, maxBatches)
  const failed = await deleteInBatches(db, DELETE_FAILED_JOBS, failedCutoff, limit, maxBatches)
  const batches = await deleteInBatches(db, DELETE_FINISHED_BATCHES, completedCutoff, limit, maxBatches)
  const attempts = await deleteInBatches(db, DELETE_EMBEDDING_ATTEMPTS, attemptCutoff, limit, maxBatches)

  return {
    completedJobs: completed.deleted,
    failedJobs: failed.deleted,
    finishedBatches: batches.deleted,
    embeddingAttempts: attempts.deleted,
    truncated: completed.truncated || failed.truncated || batches.truncated || attempts.truncated,
  }
}
