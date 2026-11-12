import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  COMPLETED_JOB_RETENTION_SECONDS,
  EMBEDDING_ATTEMPT_RETENTION_SECONDS,
  FAILED_JOB_RETENTION_SECONDS,
  pruneFinishedJobs,
} from './finished-job-retention'

const DAY = 24 * 60 * 60
const NOW = 1_800_000_000

describe('pruneFinishedJobs', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE job_batches (
        id TEXT PRIMARY KEY,
        parent_batch_id TEXT,
        finished_at INTEGER
      );
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        batch_id TEXT REFERENCES job_batches(id),
        payload TEXT NOT NULL DEFAULT '{}',
        completed_at INTEGER,
        failed_at INTEGER
      );
      CREATE TABLE failed_jobs (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        failed_at INTEGER NOT NULL
      );
      CREATE TABLE embedding_attempts (
        attempt_id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL
      );
      CREATE INDEX idx_jobs_completed_at ON jobs (completed_at) WHERE completed_at IS NOT NULL;
      CREATE INDEX idx_failed_jobs_failed_at ON failed_jobs (failed_at);
      CREATE INDEX idx_job_batches_finished_at ON job_batches (finished_at);
    `)
  })

  afterEach(() => sqlite.close())

  it('deletes old finished rows and keeps active and recent ones', async () => {
    const old = NOW - COMPLETED_JOB_RETENTION_SECONDS - DAY
    sqlite.exec(`
      INSERT INTO job_batches (id, finished_at) VALUES
        ('batch-old', ${old}), ('batch-open', NULL), ('batch-recent', ${NOW - DAY});
      INSERT INTO jobs (id, batch_id, completed_at) VALUES
        ('done-old', 'batch-old', ${old}),
        ('done-open-batch', 'batch-open', ${old}),
        ('done-recent', NULL, ${NOW - DAY}),
        ('active', NULL, NULL);
      INSERT INTO failed_jobs (id, batch_id, failed_at) VALUES
        ('failed-old', NULL, ${NOW - FAILED_JOB_RETENTION_SECONDS - DAY}),
        ('failed-recent', NULL, ${NOW - DAY});
      INSERT INTO embedding_attempts (attempt_id, started_at) VALUES
        ('attempt-old', ${NOW - EMBEDDING_ATTEMPT_RETENTION_SECONDS - DAY}),
        ('attempt-recent', ${NOW - DAY});
    `)

    const report = await pruneFinishedJobs(wrapSqlite(sqlite), { now: NOW })

    expect(report).toEqual({
      completedJobs: 1,
      failedJobs: 1,
      finishedBatches: 1,
      embeddingAttempts: 1,
      truncated: false,
    })
    expect(ids('jobs')).toEqual(['active', 'done-open-batch', 'done-recent'])
    expect(ids('failed_jobs')).toEqual(['failed-recent'])
    expect(ids('job_batches')).toEqual(['batch-open', 'batch-recent'])
    expect(ids('embedding_attempts', 'attempt_id')).toEqual(['attempt-recent'])
  })

  it('keeps a finished batch while a job still names it', async () => {
    const old = NOW - COMPLETED_JOB_RETENTION_SECONDS - DAY
    sqlite.exec(`
      INSERT INTO job_batches (id, finished_at) VALUES ('batch', ${old});
      INSERT INTO jobs (id, batch_id, completed_at) VALUES ('member', 'batch', ${NOW - DAY});
    `)

    const report = await pruneFinishedJobs(wrapSqlite(sqlite), { now: NOW })

    expect(report.finishedBatches).toBe(0)
    expect(ids('job_batches')).toEqual(['batch'])
  })

  it('stops at the batch cap and reports the backlog', async () => {
    const old = NOW - COMPLETED_JOB_RETENTION_SECONDS - DAY
    const insert = sqlite.prepare(`INSERT INTO jobs (id, completed_at) VALUES (?, ?)`)
    for (let i = 0; i < 7; i += 1)
      insert.run(`done-${i}`, old)

    const report = await pruneFinishedJobs(wrapSqlite(sqlite), { now: NOW, limit: 2, maxBatches: 2 })

    expect(report.completedJobs).toBe(4)
    expect(report.truncated).toBe(true)
    expect(ids('jobs')).toHaveLength(3)
  })

  function ids(table: string, column = 'id'): string[] {
    return sqlite.prepare(`SELECT ${column} AS id FROM ${table} ORDER BY id`).all().map(row => (row as { id: string }).id)
  }
})

function wrapSqlite(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              const info = sqlite.prepare(sql).run(...params)
              return { meta: { changes: info.changes } }
            },
          }
        },
      }
    },
  } as unknown as D1Database
}
