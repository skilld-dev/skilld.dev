/// <reference types="@cloudflare/workers-types" />

import type { CadenceRunRow, StalledCadence } from '~~/server/utils/scheduled-cadence'
import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runTask } from 'nitropack/runtime'
import {
  assessTaskCadence,
  cadenceHistories,

  WATCHDOG_TASK_NAME,
} from '~~/server/utils/scheduled-cadence'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { SCHEDULE_HEALTH_LATEST_RUNS_SQL } from '#layers/identity/server/utils/daily-health-check'
import { observedSchedulePolicy, SCHEDULE_POLICY } from '#shared/schedule-policy'

const CRON = '*/5 * * * *'

interface ReinvokedTask {
  _tag: 'reinvoked'
  taskName: string
  stalled: StalledCadence
}

interface FailedReinvocation {
  _tag: 'failed'
  taskName: string
  error: string
}

function message(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return detail.trim() || 're-invocation failed without an error message'
}

/**
 * Scheduled task: heal a silent cadence.
 *
 * Every dispatch path — a bad deploy that dropped task registrations, a cron
 * trigger that stopped matching, a scheduled handler that skipped names — ends
 * the same way: the task's rows in scheduled_runs stop appearing while
 * everything else keeps firing, and nothing notices until the nightly report
 * goes red. This task shares the five-minute tick, reads each policy task's run
 * history, and re-invokes the stalled ones through the same Nitro task
 * registry the cron dispatch uses.
 *
 * It re-invokes silence, not failure: `missing_run`, `missing_cadence`, and
 * `overdue_started` get a fresh dispatch; `latest_failed` and `latest_expired`
 * stay flagged for the daily check-in because the task's own cadence retries
 * them, and re-invoking those every five minutes would multiply a failing
 * task's side effects. A live run inside its runtime window proves the trigger
 * fired and is left alone.
 */
export default defineScheduledTask({
  name: 'scheduled-cadence-watchdog',
  cron: '*/5 * * * *',
  description: 'Re-invoke scheduled tasks whose scheduled_runs history shows a stalled cadence',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: WATCHDOG_TASK_NAME, outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy(WATCHDOG_TASK_NAME),
    }, async () => {
      const startedAt = Date.now()
      const rows = await db
        .prepare(SCHEDULE_HEALTH_LATEST_RUNS_SQL)
        .all<CadenceRunRow>()
        .then(result => result.results ?? [])
      const decisions = assessTaskCadence(
        SCHEDULE_POLICY,
        cadenceHistories(rows),
        Math.floor(startedAt / 1000),
      )
      const stalled = decisions.filter(decision => decision._tag === 'reinvoke')
      const flagged = decisions
        .filter(decision => decision._tag === 'leave' && decision.health.alertable)
        .map(decision => decision.taskName)

      // The env travels with the re-invocation: cron events never run the
      // request plugin that mirrors bindings onto globalThis, so an empty
      // context would make the re-invoked task see no bindings mid-cron.
      // Each race is bounded by the watchdog's remaining runtime budget:
      // runTask returns the cached in-flight promise of a hung task, so one
      // never-settling target would otherwise hang the watchdog on every tick.
      const { maxRuntimeSeconds } = observedSchedulePolicy(WATCHDOG_TASK_NAME)
      const outcomes = await Promise.all(stalled.map((decision) => {
        const remainingMs = Math.max(0, maxRuntimeSeconds * 1000 - (Date.now() - startedAt))
        let budgetTimer: ReturnType<typeof setTimeout> | undefined
        const budgetExceeded = new Promise<FailedReinvocation>((resolve) => {
          budgetTimer = setTimeout(resolve, remainingMs, {
            _tag: 'failed',
            taskName: decision.taskName,
            error: `re-invocation passed the watchdog runtime budget of ${maxRuntimeSeconds}s`,
          })
        })
        return Promise.race([
          runTask(decision.taskName, {
            payload: {},
            context: { cloudflare: { env } },
          }).then((): ReinvokedTask | FailedReinvocation => ({
            _tag: 'reinvoked',
            taskName: decision.taskName,
            stalled: decision.stalled,
          }), (error: unknown): ReinvokedTask | FailedReinvocation => ({
            _tag: 'failed',
            taskName: decision.taskName,
            error: message(error),
          })),
          budgetExceeded,
        ]).finally(() => clearTimeout(budgetTimer))
      }))
      const reinvoked = outcomes.filter(outcome => outcome._tag === 'reinvoked')
      const failed = outcomes.filter(outcome => outcome._tag === 'failed')

      if (reinvoked.length > 0) {
        emitOperationalEvent(createWideEvent({
          'operation': `${WATCHDOG_TASK_NAME}-reinforce`,
          'outcome': failed.length > 0 ? 'partial' : 'completed',
          'reinvoked.count': reinvoked.length,
          'reinvoked.tasks': reinvoked.map(outcome => outcome.taskName).join(','),
          ...(failed.length > 0
            ? { 'failed.tasks': failed.map(outcome => outcome.taskName).join(',') }
            : {}),
        }))
      }

      await reportJobRun(db, WATCHDOG_TASK_NAME, {
        cron: CRON,
        status: failed.length > 0 ? 'partial' : 'ok',
        durationMs: Date.now() - startedAt,
        error: failed.length > 0
          ? failed.map(outcome => `${outcome.taskName}: ${outcome.error}`).join('; ')
          : null,
      })

      return {
        result: {
          checked: decisions.length,
          reinvoked: reinvoked.map(outcome => ({
            taskName: outcome.taskName,
            stalled: outcome.stalled,
          })),
          failed: failed.map(outcome => ({
            taskName: outcome.taskName,
            error: outcome.error,
          })),
          flagged,
        },
      }
    })
  },
})
