/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { admitTrendingSkills } from '../utils/trending-admission'

const CRON = '0 * * * *'

/**
 * Scheduled task: SEO experiment, gate 2026-11-11. Add every Skill now on a
 * trending board to the admitted set. Only admitted Skills are indexable.
 * The rule, the reason, and the cull path live in `../utils/trending-admission.ts`.
 *
 * Hourly, so a Skill that trends is admitted within the hour. It never removes
 * a row: an index flip-flop costs more than a stale page.
 */
export default defineScheduledTask({
  name: 'admit-trending-skills',
  cron: '0 * * * *',
  description: 'Add Skills on the trending boards to the indexable set (SEO experiment)',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'admit-trending-skills', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('admit-trending-skills'),
    }, async () => {
      const startedAt = Date.now()
      const admitted = await admitTrendingSkills(db, Math.floor(startedAt / 1000))
      emitOperationalEvent(createWideEvent({
        'operation': 'admit-trending-skills',
        'outcome': 'completed',
        'success.count': admitted.length,
      }))
      await reportJobRun(db, 'admit-trending-skills', {
        cron: CRON,
        status: 'ok',
        durationMs: Date.now() - startedAt,
      })
      return { result: { admitted: admitted.length } }
    })
  },
})
