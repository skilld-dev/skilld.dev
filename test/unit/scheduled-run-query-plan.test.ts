import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { SCHEDULE_HEALTH_LATEST_RUNS_SQL } from '../../layers/identity/server/utils/daily-health-check'
import { SCHEDULED_RUN_QUERIES } from '../../server/utils/scheduled-run'

interface QueryPlanRow {
  detail: string
}

function plan(sqlite: Database.Database, sql: string, bindings: unknown[] = []): string[] {
  const expanded: unknown[] = []
  const normalized = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(bindings[Number(raw) - 1])
    return '?'
  })
  return (sqlite.prepare(`EXPLAIN QUERY PLAN ${normalized}`).all(...expanded) as QueryPlanRow[])
    .map(row => row.detail)
}

describe('scheduled run query plans', () => {
  it('uses bounded indexes without correlated scans or temp sorting', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations/0074_scheduled_run_history.sql'), 'utf8'))

    const expiry = plan(sqlite, SCHEDULED_RUN_QUERIES.expire, [1_000])
    expect(expiry.join('\n')).toContain('idx_scheduled_runs_started_expiry')

    const insert = plan(sqlite, SCHEDULED_RUN_QUERIES.insertStarted, [
      'run',
      'task',
      '* * * * *',
      1,
      2,
      null,
      null,
      null,
      null,
    ])
    expect(insert).toEqual([])
    expect(() => sqlite.exec(`
      INSERT INTO scheduled_runs (
        run_id, task_name, declared_cron, status, started_at, expires_at
      ) VALUES
        ('duplicate', 'task', '* * * * *', 'started', 1, 2),
        ('duplicate', 'task', '* * * * *', 'started', 1, 2)
    `)).toThrow()

    const terminal = plan(sqlite, SCHEDULED_RUN_QUERIES.finish, [
      'run',
      'succeeded',
      2,
      null,
    ])
    expect(terminal.join('\n')).toContain('sqlite_autoindex_scheduled_runs_1')

    // The watchdog runs this every five minutes. A plan that walks the whole
    // table read 551k rows per call in production on 2026-09-29, a quarter of
    // all skilld-db reads. Every access must be an index seek.
    const latest = plan(sqlite, SCHEDULE_HEALTH_LATEST_RUNS_SQL)
    const latestText = latest.join('\n')
    expect(latestText).toContain('idx_scheduled_runs_task_latest')
    expect(latest.filter(detail => /^SCAN (?!tasks\b)/.test(detail))).toEqual([])
    expect(latestText).not.toContain('USE TEMP B-TREE')

    const prune = plan(sqlite, SCHEDULED_RUN_QUERIES.prune, ['task', 1_000, 10])
    expect(prune.join('\n')).toContain('idx_scheduled_runs_task_latest')
    expect(prune.filter(detail => detail.startsWith('SCAN '))).toEqual([])
  })
})

/**
 * The window-function query the watchdog ran before 2026-09-29. It returns the
 * right rows and reads the whole table to find them, so it stays here as the
 * oracle the index-seek query must agree with.
 */
const FULL_SCAN_LATEST_RUNS_SQL = `
  WITH ranked AS (
    SELECT task_name, status, started_at, expires_at, finished_at, error,
      ROW_NUMBER() OVER (PARTITION BY task_name ORDER BY started_at DESC, run_id DESC) AS recency
    FROM scheduled_runs
  ),
  ranked_terminal AS (
    SELECT task_name, status, started_at, expires_at, finished_at, error,
      ROW_NUMBER() OVER (PARTITION BY task_name ORDER BY started_at DESC, run_id DESC) AS recency
    FROM scheduled_runs
    WHERE status != 'started'
  )
  SELECT 'latest' AS slot, task_name, status, started_at, expires_at, finished_at, error
  FROM ranked WHERE recency = 1
  UNION ALL
  SELECT 'terminal' AS slot, task_name, status, started_at, expires_at, finished_at, error
  FROM ranked_terminal WHERE recency = 1
`

describe('latest scheduled runs', () => {
  function sorted(rows: unknown[]): unknown[] {
    return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }

  it('returns an empty history for an empty table', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations/0074_scheduled_run_history.sql'), 'utf8'))
    expect(sqlite.prepare(SCHEDULE_HEALTH_LATEST_RUNS_SQL).all()).toEqual([])
  })

  it('matches the full-scan oracle on every task shape', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations/0074_scheduled_run_history.sql'), 'utf8'))
    const insert = sqlite.prepare(`
      INSERT INTO scheduled_runs (
        run_id, task_name, declared_cron, status, started_at, expires_at,
        finished_at, duration_ms, error
      ) VALUES (?, ?, '* * * * *', ?, ?, ? + 300, ?, ?, ?)
    `)
    const add = (runId: string, taskName: string, status: string, startedAt: number) => {
      const terminal = status !== 'started'
      insert.run(
        runId,
        taskName,
        status,
        startedAt,
        startedAt,
        terminal ? startedAt + 5 : null,
        terminal ? 5000 : null,
        status === 'failed' || status === 'expired' ? `${status} ${runId}` : null,
      )
    }
    // In flight after a failure: latest and terminal differ.
    add('a1', 'alpha', 'succeeded', 100)
    add('a2', 'alpha', 'failed', 200)
    add('a3', 'alpha', 'started', 300)
    // Only ever in flight: no terminal row at all.
    add('b1', 'beta', 'started', 100)
    // Two runs share a start second: run_id breaks the tie.
    add('c1', 'gamma', 'succeeded', 500)
    add('c2', 'gamma', 'expired', 500)
    add('c0', 'gamma', 'failed', 400)
    // A single terminal row.
    add('d1', 'delta', 'succeeded', 50)
    // Names that sort next to each other, so the task walk cannot skip one.
    add('e1', 'delta-', 'failed', 60)
    add('e2', 'delta-', 'succeeded', 70)
    // Many runs behind the latest, as the five-minute tasks have.
    for (let index = 0; index < 50; index++)
      add(`f${String(index).padStart(2, '0')}`, 'zeta', index % 7 === 0 ? 'failed' : 'succeeded', 1_000 + index)

    const actual = sqlite.prepare(SCHEDULE_HEALTH_LATEST_RUNS_SQL).all()
    const expected = sqlite.prepare(FULL_SCAN_LATEST_RUNS_SQL).all()
    expect(actual).toHaveLength(11)
    expect(sorted(actual)).toEqual(sorted(expected))
  })
})
