import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'migrations/0074_scheduled_run_history.sql'), 'utf8')

describe('scheduled run migration', () => {
  it('rejects illegal started and terminal shapes', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(migration)

    expect(() => sqlite.exec(`
      INSERT INTO scheduled_runs (
        run_id, task_name, declared_cron, status, started_at, expires_at, finished_at
      ) VALUES ('bad-start', 'task', '* * * * *', 'started', 1, 2, 2)
    `)).toThrow()
    expect(() => sqlite.exec(`
      INSERT INTO scheduled_runs (
        run_id, task_name, declared_cron, status, started_at, expires_at, finished_at, duration_ms
      ) VALUES ('bad-failure', 'task', '* * * * *', 'failed', 1, 2, 2, 1000)
    `)).toThrow()
    expect(() => sqlite.exec(`
      INSERT INTO scheduled_runs (
        run_id, task_name, declared_cron, status, started_at, expires_at,
        finished_at, duration_ms, error
      ) VALUES ('bad-success', 'task', '* * * * *', 'succeeded', 1, 2, 2, 1000, 'wrong')
    `)).toThrow()
  })

  it('provides task-latest and started-expiry indexes', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(migration)
    const indexes = sqlite.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'index' AND tbl_name = 'scheduled_runs'
      ORDER BY name
    `).all() as Array<{ name: string }>
    expect(indexes.map(index => index.name)).toEqual([
      'idx_scheduled_runs_started_expiry',
      'idx_scheduled_runs_task_latest',
      'sqlite_autoindex_scheduled_runs_1',
    ])
  })

  it('upgrades an existing fixture without altering prior data', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE sync_jobs (name TEXT PRIMARY KEY, last_status TEXT);
      INSERT INTO sync_jobs VALUES ('sync-github-skills', 'ok');
    `)
    sqlite.exec(migration)

    expect(sqlite.prepare(`SELECT * FROM sync_jobs`).get())
      .toEqual({ name: 'sync-github-skills', last_status: 'ok' })
    expect(sqlite.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'scheduled_runs'
    `).get()).toEqual({ name: 'scheduled_runs' })
  })
})
