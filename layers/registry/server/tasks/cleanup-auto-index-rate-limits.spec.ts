import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveCloudflareBindings: vi.fn(),
  reportJobRun: vi.fn(),
}))

vi.mock('@harlan-zw/nuxt-cloudflare/bindings', () => ({
  resolveCloudflareBindings: mocks.resolveCloudflareBindings,
}))

vi.mock('~~/server/utils/sync-job-reporter', () => ({
  reportJobRun: mocks.reportJobRun,
}))

vi.mock('~~/server/utils/scheduled-run', () => ({
  runObservedScheduledTask: vi.fn(async (_input, effect) => await effect()),
}))

vi.mock('#shared/schedule-policy', () => ({
  observedSchedulePolicy: vi.fn(() => ({
    _tag: 'observed',
    taskName: 'cleanup-auto-index-rate-limits',
    cron: '0 * * * *',
    maxSilenceSeconds: 3 * 60 * 60,
    maxRuntimeSeconds: 4 * 60,
  })),
}))

vi.stubGlobal('defineScheduledTask', (task: unknown) => task)

const task = (await import('./cleanup-auto-index-rate-limits')).default

describe('cleanup-auto-index-rate-limits task', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    vi.clearAllMocks()
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE auto_index_rate_limits (
        bucket TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0)
      );
    `)
    mocks.resolveCloudflareBindings.mockReturnValue({ DB: wrapSqlite(sqlite) })
  })

  afterEach(() => sqlite.close())

  it('deletes expired buckets through the scheduled run and reports the run', async () => {
    const windowSeconds = 3600
    const now = Math.floor(Date.now() / 1000)
    sqlite.prepare(
      `INSERT INTO auto_index_rate_limits (bucket, window_start, hits) VALUES (?, ?, ?)`,
    ).run('client:stale', now - 2 * windowSeconds, 5)
    sqlite.prepare(
      `INSERT INTO auto_index_rate_limits (bucket, window_start, hits) VALUES (?, ?, ?)`,
    ).run('client:current', now, 3)

    const result = await task.run({ context: {} } as never)

    expect(result).toEqual({ result: { deleted: 1 } })
    const buckets = sqlite.prepare(`SELECT bucket FROM auto_index_rate_limits`).all().map((row: unknown) => (row as { bucket: string }).bucket)
    expect(buckets).toEqual(['client:current'])
    expect(mocks.reportJobRun).toHaveBeenCalledOnce()
  })
})

function wrapSqlite(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all<T>() {
              return { results: sqlite.prepare(sql).all(...params) as T[] }
            },
            async first<T>() {
              return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null
            },
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
