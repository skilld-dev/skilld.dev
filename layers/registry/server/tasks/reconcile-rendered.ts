import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { createRegistryJobBatch } from '~~/server/utils/registry-jobs-runtime'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { RECONCILE_RENDER_STALE_SECONDS } from '~~/server/utils/sync-thresholds'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { RECONCILE_RENDER_CANDIDATES_SQL } from '../utils/sync-candidates'

const BATCH = 50
const CRON = '20 */6 * * *'

export default defineScheduledTask({
  name: 'reconcile-rendered',
  cron: '20 */6 * * *',
  description: 'Re-sync skills with missing rendered content identity or stale render failures',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'reconcile-rendered', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('reconcile-rendered'),
    }, async () => {
      const startedAt = Date.now()
      const cutoff = Math.floor(Date.now() / 1000) - RECONCILE_RENDER_STALE_SECONDS
      const res = await db
        .prepare(RECONCILE_RENDER_CANDIDATES_SQL)
        .bind(cutoff, BATCH)
        .all<{ owner: string, repo: string }>()

      const repos = res.results ?? []
      if (!repos.length) {
        await reportJobRun(db, 'reconcile-rendered', { cron: CRON, status: 'ok', durationMs: Date.now() - startedAt })
        return { result: { reconciled: 0 } }
      }

      const batch = await createRegistryJobBatch(
        env as Cloudflare.Env & Record<string, unknown>,
        {
          name: `render-repair:${Math.floor(startedAt / 1000)}`,
          jobs: repos.map(({ owner, repo }) => ({ operation: 'render', owner, repo })),
        },
      )
      const failed = batch.dispatched.filter(result => result.status !== 'sent').length
      const ok = repos.length - failed
      await reportJobRun(db, 'reconcile-rendered', {
        cron: CRON,
        status: failed > 0 ? (ok > 0 ? 'partial' : 'error') : 'ok',
        durationMs: Date.now() - startedAt,
        error: failed > 0 ? `${failed}/${repos.length} repos failed` : null,
      })
      return {
        result: {
          batchId: batch.batchId,
          queued: repos.length,
          dispatched: ok,
          deferredToRecovery: failed,
        },
      }
    })
  },
})
