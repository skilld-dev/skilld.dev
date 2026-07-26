import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { runObservedTask } from '../../server/utils/scheduled-run'
import {
  recordScheduledTrigger,
  scheduledTriggerForTaskContext,
} from '../../server/utils/scheduled-trigger'
import { evaluateScheduleHealth, SCHEDULE_POLICY } from '../../shared/schedule-policy'

function database(): { sqlite: Database.Database, db: D1Database } {
  const sqlite = new Database(':memory:')
  sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations/0074_scheduled_run_history.sql'), 'utf8'))
  const db = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          const expandedBindings: unknown[] = []
          const expandedSql = sql.replace(/\?(\d+)/g, (_, raw: string) => {
            expandedBindings.push(bindings[Number(raw) - 1])
            return '?'
          })
          const boundStatement = sqlite.prepare(expandedSql)
          return {
            async run() {
              const result = boundStatement.run(...expandedBindings)
              return { success: true, meta: { changes: result.changes } }
            },
            async all<T>() {
              return { success: true, results: boundStatement.all(...expandedBindings) as T[] }
            },
          }
        },
      }
    },
  } as unknown as D1Database
  return { sqlite, db }
}

const input = {
  taskName: 'sync-github-skills',
  cron: '0 * * * *',
  maxRuntimeSeconds: 300,
  scheduledAtMs: 1_000_000,
  triggerCron: '0 * * * *',
  cfInvocationId: 'invocation-1',
  cfVersionId: 'version-1',
} as const

describe('scheduled run lifecycle', () => {
  it('records one successful terminal state', async () => {
    const { sqlite, db } = database()
    const result = await runObservedTask(
      { db, now: () => 1_000, newRunId: () => 'run-1' },
      input,
      async () => 'done',
    )

    expect(result).toBe('done')
    expect(sqlite.prepare('SELECT status, COUNT(*) count FROM scheduled_runs GROUP BY status').all())
      .toEqual([{ status: 'succeeded', count: 1 }])
  })

  it('records failure then rethrows the original task error', async () => {
    const { sqlite, db } = database()
    const failure = new Error('task exploded')

    await expect(runObservedTask(
      { db, now: () => 1_000, newRunId: () => 'run-2' },
      input,
      async () => {
        throw failure
      },
    )).rejects.toBe(failure)

    expect(sqlite.prepare('SELECT status, error FROM scheduled_runs').get())
      .toEqual({ status: 'failed', error: 'task exploded' })
  })

  it('expires abandoned started runs before beginning a new attempt', async () => {
    const { sqlite, db } = database()
    sqlite.prepare(`
      INSERT INTO scheduled_runs (
        run_id, task_name, declared_cron, status, started_at, expires_at
      ) VALUES ('abandoned', 'sync-github-skills', '0 * * * *', 'started', 100, 200)
    `).run()

    await runObservedTask(
      { db, now: () => 1_000, newRunId: () => 'run-3' },
      input,
      async () => undefined,
    )

    expect(sqlite.prepare(`SELECT status FROM scheduled_runs WHERE run_id = 'abandoned'`).get())
      .toEqual({ status: 'expired' })
  })

  it('does not permit a terminal run to transition twice', () => {
    const { sqlite } = database()
    sqlite.prepare(`
      INSERT INTO scheduled_runs (
        run_id, task_name, declared_cron, status, started_at, expires_at,
        finished_at, duration_ms
      ) VALUES ('terminal', 'sync-github-skills', '0 * * * *', 'succeeded', 100, 200, 110, 10000)
    `).run()

    expect(() => sqlite.prepare(`
      UPDATE scheduled_runs
      SET status = 'failed', error = 'late failure'
      WHERE run_id = 'terminal'
    `).run()).toThrow()
  })

  it('surfaces a missing cadence as alertable', () => {
    const policy = SCHEDULE_POLICY.find(entry => entry._tag === 'observed')!
    const result = evaluateScheduleHealth(policy, { latest: null, latestTerminal: null }, 10_000)
    expect(result).toMatchObject({ _tag: 'missing_run', alertable: true })
  })

  it('surfaces latest failure, expiry, and overdue started attempts', () => {
    const policy = SCHEDULE_POLICY.find(entry => entry._tag === 'observed')!
    const failed = {
      status: 'failed',
      startedAt: 9_000,
      expiresAt: 9_300,
      finishedAt: 9_100,
      error: 'failed',
    } as const
    const expired = {
      status: 'expired',
      startedAt: 9_000,
      expiresAt: 9_300,
      finishedAt: 9_301,
      error: 'expired',
    } as const
    expect(evaluateScheduleHealth(policy, { latest: failed, latestTerminal: failed }, 10_000))
      .toMatchObject({ _tag: 'latest_failed', alertable: true })
    expect(evaluateScheduleHealth(policy, { latest: expired, latestTerminal: expired }, 10_000))
      .toMatchObject({ _tag: 'latest_expired', alertable: true })
    expect(evaluateScheduleHealth(policy, {
      latest: {
        status: 'started',
        startedAt: 9_000,
        expiresAt: 9_300,
        finishedAt: null,
        error: null,
      },
      latestTerminal: null,
    }, 10_000)).toMatchObject({ _tag: 'overdue_started', alertable: true })
  })

  // daily-health-check fires on `0 22 * * *` and the hourly tasks on `0 * * * *`,
  // so it always samples the run that is still in flight. On 2026-07-26 that
  // reported sync-github-skills healthy through ten consecutive expiries.
  it('does not let a run in flight mask the last completed verdict', () => {
    const policy = SCHEDULE_POLICY.find(entry => entry._tag === 'observed')!
    const inFlight = {
      status: 'started',
      startedAt: 9_900,
      expiresAt: 12_000,
      finishedAt: null,
      error: null,
    } as const

    expect(evaluateScheduleHealth(policy, {
      latest: inFlight,
      latestTerminal: {
        status: 'expired',
        startedAt: 9_000,
        expiresAt: 9_300,
        finishedAt: 9_301,
        error: 'run expired before terminal state was recorded',
      },
    }, 10_000)).toMatchObject({
      _tag: 'latest_expired',
      alertable: true,
      error: 'run expired before terminal state was recorded',
    })

    expect(evaluateScheduleHealth(policy, {
      latest: inFlight,
      latestTerminal: {
        status: 'failed',
        startedAt: 9_000,
        expiresAt: 9_300,
        finishedAt: 9_100,
        error: 'boom',
      },
    }, 10_000)).toMatchObject({ _tag: 'latest_failed', alertable: true, error: 'boom' })
  })

  it('stays healthy when a run in flight follows a success', () => {
    const policy = SCHEDULE_POLICY.find(entry => entry._tag === 'observed')!
    expect(evaluateScheduleHealth(policy, {
      latest: {
        status: 'started',
        startedAt: 9_900,
        expiresAt: 12_000,
        finishedAt: null,
        error: null,
      },
      latestTerminal: {
        status: 'succeeded',
        startedAt: 9_000,
        expiresAt: 9_300,
        finishedAt: 9_050,
        error: null,
      },
    }, 10_000)).toMatchObject({ _tag: 'healthy', alertable: false })
  })

  it('propagates terminal persistence failure without losing the task outcome', async () => {
    const { sqlite, db } = database()
    const originalPrepare = db.prepare.bind(db)
    const failingDb = {
      prepare(sql: string) {
        if (sql.includes('SET status = ?2')) {
          return {
            bind() {
              return {
                async run() {
                  return { success: true, meta: { changes: 0 } }
                },
              }
            },
          }
        }
        return originalPrepare(sql)
      },
    } as unknown as D1Database
    const effect = vi.fn(async () => 'done')

    await expect(runObservedTask(
      { db: failingDb, now: () => 1_000, newRunId: () => 'run-terminal-failure' },
      input,
      effect,
    )).rejects.toMatchObject({ name: 'ScheduledRunPersistenceError' })
    expect(effect).toHaveBeenCalledOnce()
    expect(sqlite.prepare(`SELECT status FROM scheduled_runs WHERE run_id = 'run-terminal-failure'`).get())
      .toEqual({ status: 'started' })

    await runObservedTask(
      { db, now: () => 2_000, newRunId: () => 'next-run' },
      input,
      async () => undefined,
    )
    expect(sqlite.prepare(`SELECT status FROM scheduled_runs WHERE run_id = 'run-terminal-failure'`).get())
      .toEqual({ status: 'expired' })
  })
})

describe('scheduled trigger boundary', () => {
  it('preserves controller metadata for the same ExecutionContext', () => {
    const executionContext = { invocationId: 'invocation-explicit' }
    recordScheduledTrigger({
      controller: { cron: '0 * * * *', scheduledTime: 123_456 },
      context: executionContext,
    })
    expect(scheduledTriggerForTaskContext({
      cloudflare: { context: executionContext },
    })).toEqual({
      scheduledAtMs: 123_456,
      triggerCron: '0 * * * *',
      cfInvocationId: 'invocation-explicit',
    })
  })

  it('keeps an unavailable invocation identifier null', () => {
    const executionContext = {}
    recordScheduledTrigger({
      controller: { cron: '*/5 * * * *', scheduledTime: 234_567 },
      context: executionContext,
    })
    expect(scheduledTriggerForTaskContext({
      cloudflare: { context: executionContext },
    })).toEqual({
      scheduledAtMs: 234_567,
      triggerCron: '*/5 * * * *',
      cfInvocationId: null,
    })
  })
})
