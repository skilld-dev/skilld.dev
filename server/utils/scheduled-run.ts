/// <reference types="@cloudflare/workers-types" />

import type { ObservedSchedulePolicy } from '../../shared/schedule-policy'
import { scheduledTriggerForTaskContext } from './scheduled-trigger'

interface ScheduledRunDependencies {
  db: D1Database
  now: () => number
  newRunId: () => string
}

interface ScheduledRunInput {
  taskName: string
  cron: string
  maxRuntimeSeconds: number
  scheduledAtMs: number | null
  triggerCron: string | null
  cfInvocationId: string | null
  cfVersionId: string | null
}

interface ScheduledTaskContext {
  cloudflare?: {
    context?: unknown
  }
}

interface ScheduledTaskWrapperInput {
  db: D1Database
  env: Cloudflare.Env
  context: ScheduledTaskContext | unknown
  policy: ObservedSchedulePolicy
}

export const SCHEDULED_RUN_QUERIES = {
  expire: `
    UPDATE scheduled_runs
    SET status = 'expired',
        finished_at = ?1,
        duration_ms = MAX(0, (?1 - started_at) * 1000),
        error = 'run expired before terminal state was recorded'
    WHERE status = 'started'
      AND expires_at <= ?1
  `,
  insertStarted: `
    INSERT INTO scheduled_runs (
      run_id, task_name, declared_cron, status, started_at, expires_at,
      scheduled_at_ms, trigger_cron, cf_invocation_id, cf_version_id
    ) VALUES (?1, ?2, ?3, 'started', ?4, ?5, ?6, ?7, ?8, ?9)
  `,
  finish: `
    UPDATE scheduled_runs
    SET status = ?2,
        finished_at = ?3,
        duration_ms = MAX(0, (?3 - started_at) * 1000),
        error = ?4
    WHERE run_id = ?1
      AND status = 'started'
  `,
} as const

function message(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return detail.trim() || 'scheduled task failed without an error message'
}

function persistenceError(operation: string, runId: string): Error {
  const error = new Error(`scheduled run ${operation} did not affect exactly one started row: ${runId}`)
  error.name = 'ScheduledRunPersistenceError'
  return error
}

async function expireAbandonedRuns(db: D1Database, now: number): Promise<void> {
  await db.prepare(SCHEDULED_RUN_QUERIES.expire).bind(now).run()
}

async function insertStartedRun(
  dependencies: ScheduledRunDependencies,
  input: ScheduledRunInput,
  runId: string,
  startedAt: number,
): Promise<void> {
  await dependencies.db.prepare(SCHEDULED_RUN_QUERIES.insertStarted).bind(
    runId,
    input.taskName,
    input.cron,
    startedAt,
    startedAt + input.maxRuntimeSeconds,
    input.scheduledAtMs,
    input.triggerCron,
    input.cfInvocationId,
    input.cfVersionId,
  ).run()
}

async function finishRun(
  dependencies: ScheduledRunDependencies,
  runId: string,
  startedAt: number,
  outcome: { _tag: 'succeeded' } | { _tag: 'failed', error: string },
): Promise<void> {
  const finishedAt = Math.max(startedAt, dependencies.now())
  const result = await dependencies.db.prepare(SCHEDULED_RUN_QUERIES.finish).bind(
    runId,
    outcome._tag,
    finishedAt,
    outcome._tag === 'failed' ? outcome.error : null,
  ).run()
  if (Number(result.meta.changes ?? 0) !== 1)
    throw persistenceError('terminal update', runId)
}

export async function runObservedTask<T>(
  dependencies: ScheduledRunDependencies,
  input: ScheduledRunInput,
  effect: () => Promise<T>,
): Promise<T> {
  const startedAt = dependencies.now()
  const runId = dependencies.newRunId()
  await expireAbandonedRuns(dependencies.db, startedAt)
  await insertStartedRun(dependencies, input, runId, startedAt)

  let result: T
  try {
    result = await effect()
  }
  catch (taskError) {
    try {
      await finishRun(dependencies, runId, startedAt, {
        _tag: 'failed',
        error: message(taskError),
      })
    }
    catch (persistenceFailure) {
      throw new AggregateError(
        [taskError, persistenceFailure],
        `scheduled task ${input.taskName} failed and its terminal state could not be recorded`,
      )
    }
    throw taskError
  }

  await finishRun(dependencies, runId, startedAt, { _tag: 'succeeded' })
  return result
}

function versionId(env: Cloudflare.Env): string | null {
  const value = env.CF_VERSION_METADATA?.id
  return typeof value === 'string' && value.trim() ? value : null
}

export async function runObservedScheduledTask<T>(
  input: ScheduledTaskWrapperInput,
  effect: () => Promise<T>,
): Promise<T> {
  const trigger = scheduledTriggerForTaskContext(input.context)
  return await runObservedTask({
    db: input.db,
    now: () => Math.floor(Date.now() / 1000),
    newRunId: () => crypto.randomUUID(),
  }, {
    taskName: input.policy.taskName,
    cron: input.policy.cron,
    maxRuntimeSeconds: input.policy.maxRuntimeSeconds,
    scheduledAtMs: trigger.scheduledAtMs,
    triggerCron: trigger.triggerCron,
    cfInvocationId: trigger.cfInvocationId,
    cfVersionId: versionId(input.env),
  }, effect)
}
