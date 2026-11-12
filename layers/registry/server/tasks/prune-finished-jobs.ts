/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { pruneFinishedJobs } from '../utils/finished-job-retention'

const CRON = '40 * * * *'

/**
 * Scheduled task: delete finished durable job rows and old embedding attempts.
 *
 * nuxt-cf-jobs soft-completes a job, so every hourly sync left up to 250
 * `jobs` rows behind, with their payloads and retry reasons, forever. D1 is a
 * 10 GB store and reached that limit on 2026-11-04. Append-only history needs
 * a retention window, and this task is the window for the job tables.
 *
 * The minute avoids the top of the hour, when the sync creates its batch.
 */
export default defineScheduledTask({
  name: 'prune-finished-jobs',
  cron: '40 * * * *',
  description: 'Delete finished durable job rows and old embedding attempts',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'prune-finished-jobs', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('prune-finished-jobs'),
    }, async () => {
      const startedAt = Date.now()
      const report = await pruneFinishedJobs(db, { now: Math.floor(startedAt / 1000) })
      emitOperationalEvent(createWideEvent({
        'operation': 'prune-finished-jobs',
        'outcome': 'completed',
        'success.count': report.completedJobs + report.failedJobs + report.finishedBatches + report.embeddingAttempts,
        'truncated': report.truncated,
      }))
      await reportJobRun(db, 'prune-finished-jobs', {
        cron: CRON,
        status: 'ok',
        durationMs: Date.now() - startedAt,
      })
      return { result: report }
    })
  },
})
