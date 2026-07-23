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

    const latest = plan(sqlite, SCHEDULE_HEALTH_LATEST_RUNS_SQL)
    const latestText = latest.join('\n')
    expect(latestText).toContain('idx_scheduled_runs_task_latest')
    expect(latestText).not.toContain('CORRELATED')
    expect(latestText).not.toContain('USE TEMP B-TREE')
  })
})
