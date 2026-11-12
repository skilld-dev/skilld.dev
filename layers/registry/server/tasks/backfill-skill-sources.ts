/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { backfillSkillSources } from '../utils/skill-source-backfill'

const CRON = '*/5 * * * *'

/**
 * Scheduled task: copy every stored SKILL.md body to R2 (ADR-0019).
 *
 * The sync writes new bodies to R2 as it goes. This task walks the rows that
 * predate that, 200 a run by rowid, so every row's hash names an object
 * before the D1 column is nulled. Once the walk reaches the end of the table
 * each run is one indexed read and no puts.
 */
export default defineScheduledTask({
  name: 'backfill-skill-sources',
  cron: '*/5 * * * *',
  description: 'Copy stored SKILL.md bodies to R2 by content hash',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    const bucket = env?.PUBLIC_ARTIFACTS
    if (!env || !db || !bucket) {
      emitOperationalEvent(createWideEvent({ operation: 'backfill-skill-sources', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('backfill-skill-sources'),
    }, async () => {
      const startedAt = Date.now()
      const report = await backfillSkillSources(db, bucket, { now: Math.floor(startedAt / 1000) })
      emitOperationalEvent(createWideEvent({
        'operation': 'backfill-skill-sources',
        'outcome': report.failed > 0 ? 'partial' : 'completed',
        'scanned.count': report.scanned,
        'success.count': report.stored + report.existing,
        'failed.count': report.failed,
      }))
      await reportJobRun(db, 'backfill-skill-sources', {
        cron: CRON,
        status: report.failed > 0 ? 'partial' : 'ok',
        durationMs: Date.now() - startedAt,
        error: report.failed > 0 ? `${report.failed} R2 put failed; cursor held at ${report.position}` : null,
      })
      return { result: report }
    })
  },
})
