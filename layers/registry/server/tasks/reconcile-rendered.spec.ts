import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveCloudflareBindings: vi.fn(),
  reportJobRun: vi.fn(),
  createRegistryJobBatch: vi.fn(),
}))

vi.mock('@harlan-zw/nuxt-cloudflare/bindings', () => ({
  resolveCloudflareBindings: mocks.resolveCloudflareBindings,
}))

vi.mock('~~/server/utils/scheduled-run', () => ({
  runObservedScheduledTask: vi.fn(async (_input, effect) => await effect()),
}))

vi.mock('~~/server/utils/sync-job-reporter', () => ({
  reportJobRun: mocks.reportJobRun,
}))

vi.mock('~~/server/utils/registry-jobs-runtime', () => ({
  createRegistryJobBatch: mocks.createRegistryJobBatch,
}))

vi.mock('#shared/schedule-policy', () => ({
  observedSchedulePolicy: vi.fn(() => ({
    _tag: 'observed',
    taskName: 'reconcile-rendered',
    cron: '20 */6 * * *',
    maxSilenceSeconds: 6 * 60 * 60,
    maxRuntimeSeconds: 4 * 60,
  })),
}))

vi.stubGlobal('defineScheduledTask', (task: unknown) => task)

const task = (await import('./reconcile-rendered')).default

describe('reconcile-rendered task', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    vi.clearAllMocks()
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        broken_since INTEGER,
        tree_truncated_at INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        rendered_status TEXT,
        rendered_skill_path TEXT,
        rendered_raw_sha256 TEXT,
        last_synced_at INTEGER,
        PRIMARY KEY (owner, repo, name)
      );
    `)
    mocks.resolveCloudflareBindings.mockReturnValue({ DB: wrapSqlite(sqlite) })
  })

  afterEach(() => sqlite.close())

  it('queues render repair jobs for repos the candidates SQL selects', async () => {
    sqlite.exec(`
      INSERT INTO repos VALUES
        ('acme', 'needs-render', NULL, NULL),
        ('acme', 'too-large', NULL, 900000),
        ('acme', 'broken', 900000, NULL);
      INSERT INTO skills VALUES
        ('acme', 'needs-render', 'one', 'failed', NULL, NULL, 100),
        ('acme', 'too-large', 'one', 'failed', NULL, NULL, 100),
        ('acme', 'broken', 'one', 'failed', NULL, NULL, 100);
    `)
    mocks.createRegistryJobBatch.mockResolvedValue({
      batchId: 'batch-1',
      dispatched: [{ status: 'sent' }],
    })

    const result = await task.run({ context: {} } as never)

    expect(result).toEqual({
      result: { batchId: 'batch-1', queued: 1, dispatched: 1, deferredToRecovery: 0 },
    })
    expect(mocks.createRegistryJobBatch).toHaveBeenCalledWith(
      expect.anything(),
      {
        name: expect.stringMatching(/^render-repair:\d+$/),
        jobs: [{ operation: 'render', owner: 'acme', repo: 'needs-render' }],
      },
    )
    expect(mocks.reportJobRun).toHaveBeenCalledWith(
      expect.anything(),
      'reconcile-rendered',
      expect.objectContaining({ status: 'ok' }),
    )
  })

  it('reports ok without creating a batch when no repo is due', async () => {
    const result = await task.run({ context: {} } as never)

    expect(result).toEqual({ result: { reconciled: 0 } })
    expect(mocks.createRegistryJobBatch).not.toHaveBeenCalled()
    expect(mocks.reportJobRun).toHaveBeenCalledWith(
      expect.anything(),
      'reconcile-rendered',
      expect.objectContaining({ status: 'ok' }),
    )
  })
})

function wrapSqlite(sqlite: Database.Database): D1Database {
  // D1 binds positionally; better-sqlite3 needs numbered parameters as an object.
  const numbered = (params: unknown[]) => Object.fromEntries(params.map((value, index) => [index + 1, value]))
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all<T>() {
              return { results: sqlite.prepare(sql).all(numbered(params)) as T[] }
            },
            async first<T>() {
              return (sqlite.prepare(sql).get(numbered(params)) as T | undefined) ?? null
            },
            async run() {
              const info = sqlite.prepare(sql).run(numbered(params))
              return { meta: { changes: info.changes } }
            },
          }
        },
      }
    },
  } as unknown as D1Database
}
