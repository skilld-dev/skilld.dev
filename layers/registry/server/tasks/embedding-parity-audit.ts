/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import {
  auditEmbeddingParityViaBindings,
  embeddingParityAuditAlarm,
  embeddingParityRunDecision,
  pruneOrphanEmbeddings,
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
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
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
        // number that was never stable. Pruning is skipped for the same reason:
        // an unread index is no basis for deleting from it.
        await reportJobRun(db, 'embedding-parity-audit', {
          cron: CRON,
          status: 'partial',
          durationMs: Date.now() - startedAt,
          error: `Index unsettled: ${alarm.reason}`,
        })
        return { result: { alarm, ...summary } }
      }

      // Prune after the audit, never before. Vectorize deletes asynchronously, so
      // a prune running first would leave a mutation in flight and the audit
      // would report `unsettled` every night it deleted anything, masking real
      // drift. Tonight's audit judges the state the prune inherited; tomorrow's
      // confirms the deletion landed.
      const prune = await pruneOrphanEmbeddings({ db, vectorize })
      if (prune.refusal) {
        console.warn(
          `[embedding-parity-audit] prune refused: ${prune.refusal.candidates} candidates against ${prune.refusal.eligible} eligible`,
        )
      }

      const pruneNote = prune.refusal
        ? `; prune refused (${prune.refusal.candidates} candidates against ${prune.refusal.eligible} eligible)`
        : prune.deferred > 0
          ? `; pruned ${prune.deleted}, ${prune.deferred} deferred`
          : prune.deleted > 0
            ? `; pruned ${prune.deleted}`
            : ''
      const decision = embeddingParityRunDecision(alarm, prune)

      await reportJobRun(db, 'embedding-parity-audit', {
        cron: CRON,
        status: decision._tag === 'failed' ? 'error' : 'ok',
        durationMs: Date.now() - startedAt,
        error: decision._tag === 'failed' && alarm._tag === 'triggered'
          ? `Parity drift: ${alarm.missing} missing, ${alarm.stale} stale, ${alarm.orphan} orphan${pruneNote}`
          : decision._tag === 'failed' && prune.refusal
            ? `Orphan prune refused: ${prune.refusal.candidates} candidates against ${prune.refusal.eligible} eligible`
            : null,
      })

      if (decision._tag === 'failed' && alarm._tag === 'triggered') {
        throw new Error(
          `Embedding parity drift: ${alarm.missing} missing, ${alarm.stale} stale, ${alarm.orphan} orphan${pruneNote}`,
        )
      }
      if (decision._tag === 'failed' && prune.refusal) {
        throw new Error(
          `Orphan prune refused: ${prune.refusal.candidates} candidates against ${prune.refusal.eligible} eligible`,
        )
      }

      return { result: { alarm, ...summary, prune, decision } }
    })
  },
})
