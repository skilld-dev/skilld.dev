/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { recordTrendingAwards } from '../utils/trending-awards'

const CRON = '0 * * * *'

/**
 * Scheduled task: record each evidenced trending row as a trending award
 * (ADR-0010). The rule lives in `#shared/trending-award`.
 *
 * Hourly, so a rank held for one hour still counts. It never removes a row and
 * never worsens a rank: an award is a record of what the board said.
 */
export default defineScheduledTask({
  name: 'record-trending-awards',
  cron: '0 * * * *',
  description: 'Record the best rank each Skill reaches on the trending boards',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'record-trending-awards', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('record-trending-awards'),
    }, async () => {
      const startedAt = Date.now()
      const written = await recordTrendingAwards(db, Math.floor(startedAt / 1000))
      emitOperationalEvent(createWideEvent({
        'operation': 'record-trending-awards',
        'outcome': 'completed',
        'success.count': written.length,
      }))
      await reportJobRun(db, 'record-trending-awards', {
        cron: CRON,
        status: 'ok',
        durationMs: Date.now() - startedAt,
      })
      return { result: { written: written.length } }
    })
  },
})
