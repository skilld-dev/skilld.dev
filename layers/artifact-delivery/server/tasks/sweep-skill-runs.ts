/// <reference types="@cloudflare/workers-types" />

import type { SkillRunFailure } from '../utils/run-sweep'
import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { enqueueArtifactBuild } from '../utils/queue'
import { fetchAdmittedSkillIdentity, requestResolution } from '../utils/request-resolution'
import { runSkillRunSweep } from '../utils/run-sweep'

const CRON = '7,22,37,52 * * * *'
/**
 * 25 checks every 15 minutes is 2,400 a day, so about 2,100 indexed Skills
 * cycle in under a day. A ready build of the same commit is reused without a
 * GitHub read, so a repeat check of an unchanged Skill costs D1 rows only.
 */
const BATCH_SIZE = 25

/**
 * Scheduled task: check that every indexed Skill still runs.
 *
 * Each check is the Resolution request `skilld run OWNER/REPOSITORY/NAME`
 * sends, through the same code and build queue. The next run reads how it
 * ended. A failure a retry cannot change, on a Skill that did not fail that
 * way before, fails the run: the cadence watchdog alerts on a failed run.
 *
 * The minutes avoid the top of the hour, when the hourly sync spends most of
 * the GitHub quota.
 */
export default defineScheduledTask({
  name: 'sweep-skill-runs',
  cron: '7,22,37,52 * * * *',
  description: 'Check that each indexed Skill resolves through skilld run',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'sweep-skill-runs', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('sweep-skill-runs'),
    }, async () => {
      const startedAt = Date.now()
      const now = () => Math.floor(Date.now() / 1000)
      const report = await runSkillRunSweep({
        db,
        listRunnableSkills: async () => (await $fetch<{ items: Array<{ owner: string, repository: string, name: string }> }>('/api/skills/runnable')).items,
        requestResolution: input => requestResolution({
          db,
          lookupAdmitted: fetchAdmittedSkillIdentity(),
          enqueue: resolutionId => enqueueArtifactBuild(env, resolutionId),
          now,
        }, input),
        newIdempotencyKey: () => `sweep-${crypto.randomUUID()}`,
        now,
        batchSize: BATCH_SIZE,
      })

      for (const failure of report.newFailures) {
        emitOperationalEvent(createWideEvent({
          operation: 'sweep-skill-runs',
          outcome: 'new-failure',
          repo: skillRef(failure),
          reason: failure.tag,
        }), 'error')
      }
      emitOperationalEvent(createWideEvent({
        'operation': 'sweep-skill-runs',
        'outcome': 'completed',
        'item.count': report.started,
        'processed.count': report.settled,
        'failed.count': report.failing,
        'error.count': report.transientFailures.length,
      }), 'info')

      const alarm = report.newFailures.length > 0
        ? `skilld run fails for ${report.newFailures.length} more Skill(s): ${report.newFailures.slice(0, 10).map(failure => `${skillRef(failure)} (${failure.tag})`).join(', ')}`
        : null
      await reportJobRun(db, 'sweep-skill-runs', {
        cron: CRON,
        status: alarm ? 'error' : 'ok',
        durationMs: Date.now() - startedAt,
        error: alarm,
      })
      if (alarm)
        throw new Error(alarm)
      return {
        result: {
          started: report.started,
          settled: report.settled,
          failing: report.failing,
          transient: report.transientFailures.length,
          recovered: report.recovered.length,
        },
      }
    })
  },
})

function skillRef(failure: SkillRunFailure): string {
  return `${failure.owner}/${failure.repository}/${failure.name}`
}
