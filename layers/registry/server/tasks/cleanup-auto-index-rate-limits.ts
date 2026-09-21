/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { AUTO_INDEX_WINDOW_SECONDS } from '../utils/auto-index-repository'
import { deleteExpiredFixedWindowBuckets } from '../utils/fixed-window-rate-limit'

const CRON = '0 * * * *'

/**
 * Scheduled task: drop `auto_index_rate_limits` rows whose window ended more
 * than one window ago. The limiter inserts one row per unique caller bucket,
 * so without this the table grows by one permanent row for every visitor IP
 * that ever requested an unknown `/gh/:owner/:repo` URL, crawler IPs included.
 */
export default defineScheduledTask({
  name: 'cleanup-auto-index-rate-limits',
  cron: '0 * * * *',
  description: 'Delete expired fixed-window rate limit buckets for the auto-index trigger',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'cleanup-auto-index-rate-limits', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('cleanup-auto-index-rate-limits'),
    }, async () => {
      const startedAt = Date.now()
      const deleted = await deleteExpiredFixedWindowBuckets(db, {
        windowSeconds: AUTO_INDEX_WINDOW_SECONDS,
        now: Math.floor(startedAt / 1000),
      })
      emitOperationalEvent(createWideEvent({
        'operation': 'cleanup-auto-index-rate-limits',
        'outcome': 'completed',
        'success.count': deleted,
      }))
      await reportJobRun(db, 'cleanup-auto-index-rate-limits', {
        cron: CRON,
        status: 'ok',
        durationMs: Date.now() - startedAt,
      })
      return { result: { deleted } }
    })
  },
})
