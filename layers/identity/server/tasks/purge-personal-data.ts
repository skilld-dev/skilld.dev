/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { purgeRetainedPersonalData } from '../utils/data-retention'

const CRON = '30 4 * * *'

/**
 * Daily deletion of personal records past their retention window.
 *
 * Ended CLI tokens, CLI sign-in codes, device sessions, and old email delivery
 * history. `purgeRetainedPersonalData` holds the windows. The task shares the
 * 04:30 UTC trigger with detect-star-surges, so it adds no Cloudflare trigger.
 */
export default defineScheduledTask({
  name: 'purge-personal-data',
  cron: '30 4 * * *',
  description: 'Delete ended CLI credentials and email history past their retention window',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'purge-personal-data', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('purge-personal-data'),
    }, async () => {
      const startedAt = Date.now()
      const purged = await purgeRetainedPersonalData(db, Math.floor(startedAt / 1000))
      const elapsedMs = Date.now() - startedAt
      const deleted = Object.values(purged).reduce((sum, count) => sum + count, 0)

      emitOperationalEvent(createWideEvent({
        'operation': 'purge-personal-data',
        'outcome': 'completed',
        'success.count': deleted,
      }))
      await reportJobRun(db, 'purge-personal-data', {
        cron: CRON,
        status: 'ok',
        durationMs: elapsedMs,
      })
      return { result: { ...purged, elapsedMs } }
    })
  },
})
