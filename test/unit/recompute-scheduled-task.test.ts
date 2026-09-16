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
  runObservedScheduledTask: async (_input: unknown, effect: () => Promise<unknown>) => await effect(),
}))

vi.mock('#shared/schedule-policy', () => ({
  observedSchedulePolicy: () => ({
    _tag: 'observed',
    taskName: 'recompute-skill-scores',
    cron: '0 3 * * *',
    maxSilenceSeconds: 1200,
    maxRuntimeSeconds: 240,
  }),
}))

vi.stubGlobal('defineScheduledTask', (task: unknown) => task)

const task = (await import('../../layers/registry/server/tasks/recompute-skill-scores')).default

/**
 * The nightly task must survive one dropped D1 connection ('D1_ERROR: Network
 * connection lost.'), not mark the run RED for 24 hours. These tests drive the
 * real scheduled task against real score arithmetic on sqlite; only the Nuxt
 * plumbing (bindings, job reporter, run-history wrapper) is stubbed, mirroring
 * drain-skill-dirty.spec.ts.
 */
describe('recompute-skill-scores scheduled task', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    vi.clearAllMocks()
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        stars INTEGER NOT NULL DEFAULT 0,
        pushed_at INTEGER,
        broken_since INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT,
        current_sha TEXT,
        sync_status TEXT,
        references_count INTEGER NOT NULL DEFAULT 0,
        is_official INTEGER NOT NULL DEFAULT 0,
        owner_verified INTEGER NOT NULL DEFAULT 0,
        source_resolved INTEGER NOT NULL DEFAULT 0,
        curator_count INTEGER NOT NULL DEFAULT 0,
        curator_reason_count INTEGER NOT NULL DEFAULT 0,
        approved_social_count INTEGER NOT NULL DEFAULT 0,
        author_social_count INTEGER NOT NULL DEFAULT 0,
        seo_index_score INTEGER NOT NULL DEFAULT 0,
        seo_indexable INTEGER NOT NULL DEFAULT 0,
        seo_index_reasons TEXT NOT NULL DEFAULT '[]',
        seo_index_synced_at INTEGER,
        trust_tier TEXT NOT NULL DEFAULT 'untrusted',
        trust_source TEXT NOT NULL DEFAULT 'computed',
        trust_score INTEGER NOT NULL DEFAULT 0,
        trust_reasons TEXT NOT NULL DEFAULT '[]',
        trust_synced_at INTEGER,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE repo_trust_overrides (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        tier TEXT NOT NULL,
        reason TEXT,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE collections_v2 (id INTEGER PRIMARY KEY, deleted_at INTEGER);
      CREATE TABLE collection_skills_v2 (
        collection_id INTEGER NOT NULL,
        owner TEXT, repo TEXT, name TEXT, reason TEXT
      );
      CREATE TABLE skill_social_posts (skill_slug TEXT, status TEXT, role TEXT);
      INSERT INTO repos (owner, repo, stars, pushed_at, broken_since) VALUES
        ('acme', 'one', 100, unixepoch(), NULL),
        ('acme', 'two', 50, unixepoch(), NULL);
      INSERT INTO skills (owner, repo, name, slug) VALUES
        ('acme', 'one', 'shared', 'acme/one/shared'),
        ('acme', 'two', 'shared', 'acme/two/shared');
    `)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('retries one transient D1 error and reports a healthy run', async () => {
    const { db, counts } = flakyWrapSqlite(sqlite, [new Error('D1_ERROR: Network connection lost.')])
    mocks.resolveCloudflareBindings.mockReturnValue({ DB: db })

    const outcome = await task.run({ context: {} })

    expect(outcome).toMatchObject({ result: { scanned: 2, error: null } })
    expect(counts.terminal).toBe(2)
    expect(mocks.reportJobRun).toHaveBeenCalledWith(db, 'recompute-skill-scores', expect.objectContaining({
      cron: '0 3 * * *',
      status: 'ok',
      error: null,
    }))
  })

  it('still fails the run when the D1 error is permanent', async () => {
    const { db, counts } = flakyWrapSqlite(sqlite, [new Error('D1_ERROR: no such table: skills')])
    mocks.resolveCloudflareBindings.mockReturnValue({ DB: db })

    await expect(task.run({ context: {} })).rejects.toThrow('no such table: skills')
    expect(counts.terminal).toBe(1)
    expect(mocks.reportJobRun).toHaveBeenCalledWith(db, 'recompute-skill-scores', expect.objectContaining({
      status: 'error',
    }))
  })
})

const TERMINAL_METHODS = new Set(['run', 'first', 'all', 'raw'])

/**
 * sqlite-backed D1 stub whose queued failures reject the first terminal
 * statements in order, then behave like the plain sqlite wrapper. Bound
 * statements pass through unwrapped, so a queue of one failure lands on the
 * task's opening full-table SELECT.
 */
function flakyWrapSqlite(sqlite: Database.Database, failures: unknown[]): {
  db: D1Database
  counts: { terminal: number }
} {
  const counts = { terminal: 0 }
  const inner = wrapSqlite(sqlite)
  const db = {
    prepare: (sql: string) => {
      const statement = inner.prepare(sql)
      return new Proxy(statement, {
        get(target, property) {
          const value = Reflect.get(target, property, target)
          if (typeof value !== 'function' || !TERMINAL_METHODS.has(String(property)))
            return value
          return (...args: unknown[]) => {
            counts.terminal++
            const failure = failures.shift()
            if (failure !== undefined)
              return Promise.reject(failure)
            return value.apply(target, args)
          }
        },
      })
    },
  } as unknown as D1Database
  return { db, counts }
}

function wrapSqlite(sqlite: Database.Database): D1Database {
  const prepare = (sql: string) => {
    const bindings = (params: unknown[]) =>
      Object.fromEntries(params.map((value, index) => [String(index + 1), value]))
    const makeStatement = (params: unknown[]): D1PreparedStatement => ({
      bind: (...nextParams: unknown[]) => makeStatement(nextParams),
      async run() {
        const statement = sqlite.prepare(sql)
        const result = params.length ? statement.run(bindings(params)) : statement.run()
        return { meta: { changes: result.changes } } as D1Result
      },
      async first<T>() {
        const statement = sqlite.prepare(sql)
        return ((params.length ? statement.get(bindings(params)) : statement.get()) as T | undefined) ?? null
      },
      async all<T>() {
        const statement = sqlite.prepare(sql)
        const results = params.length ? statement.all(bindings(params)) : statement.all()
        return { results: results as T[] } as D1Result<T>
      },
    }) as D1PreparedStatement
    return makeStatement([])
  }

  return { prepare } as D1Database
}
