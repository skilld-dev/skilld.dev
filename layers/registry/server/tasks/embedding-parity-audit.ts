/// <reference types="@cloudflare/workers-types" />

import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { getTaskEnv } from '#shared/server/task-env'
import {
  auditEmbeddingParityViaBindings,
  embeddingParityAuditAlarm,
} from '../utils/embedding-parity'

const CRON = '0 21 * * *'

/**
 * Scheduled task: nightly D1 and Vectorize parity alarm.
 *
 * This ran as a GitHub Actions workflow shelling out to `wrangler vectorize
 * list-vectors`, which needs an account-level API token carrying Vectorize
 * read. The deploy token did not carry it, so the alarm failed on every
 * scheduled run and the guard it provided was never actually armed. Running
 * inside the Worker uses the bindings the Worker already holds, so there is no
 * token to scope and no CI surface that can fail silently.
 *
 * Runs at 21:00 UTC, an hour before `daily-health-check`, so the verdict is
 * fresh when the operator report is written. Drift fails the run, which is the
 * signal `evaluateScheduleHealth` already treats as alertable.
 */
export default defineScheduledTask({
  name: 'embedding-parity-audit',
  cron: '0 21 * * *',
  description: 'Audit D1 and Vectorize embedding parity over the Worker bindings',
  async run({ context }) {
    const env = getTaskEnv(context)
    const db = env?.DB as D1Database | undefined
    const vectorize = env?.SKILL_EMBEDDINGS as VectorizeIndex | undefined
    if (!env || !db) {
      console.warn('[embedding-parity-audit] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }
    if (!vectorize) {
      console.warn('[embedding-parity-audit] Vectorize binding not available in task context')
      return { result: { error: 'no-vectorize' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('embedding-parity-audit'),
    }, async () => {
      const startedAt = Date.now()
      const audit = await auditEmbeddingParityViaBindings({ db, vectorize })
      const alarm = embeddingParityAuditAlarm(audit)
      const summary = {
        ...audit.counts,
        orphan: audit.index._tag === 'settled' ? audit.index.orphan : null,
        vectorCount: audit.index.vectorCount,
      }

      if (alarm._tag === 'unsettled') {
        // The index moved while the audit read it, so the count cannot decide
        // orphans. Report it and let the next run rule, rather than alarm on a
        // number that was never stable.
        await reportJobRun(db, 'embedding-parity-audit', {
          cron: CRON,
          status: 'partial',
          durationMs: Date.now() - startedAt,
          error: `Index unsettled: ${alarm.reason}`,
        })
        return { result: { alarm, ...summary } }
      }

      await reportJobRun(db, 'embedding-parity-audit', {
        cron: CRON,
        status: alarm._tag === 'triggered' ? 'error' : 'ok',
        durationMs: Date.now() - startedAt,
        error: alarm._tag === 'triggered'
          ? `Parity drift: ${alarm.missing} missing, ${alarm.stale} stale, ${alarm.orphan} orphan`
          : null,
      })

      if (alarm._tag === 'triggered') {
        throw new Error(
          `Embedding parity drift: ${alarm.missing} missing, ${alarm.stale} stale, ${alarm.orphan} orphan`,
        )
      }

      return { result: { alarm, ...summary } }
    })
  },
})
