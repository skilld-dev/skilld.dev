import type { SyncRepoStats } from '../../layers/registry/server/utils/sync-repo'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncRepo = vi.fn<(...args: unknown[]) => Promise<SyncRepoStats>>()

vi.mock('../../layers/registry/server/utils/sync-repo', async () => {
  const actual = await vi.importActual<typeof import('../../layers/registry/server/utils/sync-repo')>(
    '../../layers/registry/server/utils/sync-repo',
  )
  return { ...actual, syncRepo: (...args: unknown[]) => syncRepo(...args) }
})

vi.mock('../../layers/registry/server/utils/github-client', () => ({
  resolveGithubBindings: () => ({}),
}))

vi.mock('../../layers/registry/server/utils/github-sync-control', () => ({
  githubSyncPermit: async () => ({ _tag: 'allowed' }),
  githubSyncPauseDecision: () => ({ _tag: 'continue' }),
  pauseGithubSync: async () => {},
}))

// `defineJob` is a Nuxt auto-import, absent from a plain unit environment.
vi.stubGlobal('defineJob', <T>(definition: T) => definition)

const { handleRegistryRepoJob } = await import('../../server/jobs/registry/repo-maintenance')

interface BoundStatement {
  executeSync: () => D1Result<unknown>
  run: () => Promise<D1Result<unknown>>
  all: <T>() => Promise<D1Result<T>>
  first: <T>() => Promise<T | null>
}

function wrapSqlite(sqlite: Database.Database): D1Database {
  const prepare = (sql: string) => ({
    bind(...params: unknown[]): BoundStatement {
      const executeSync = () => {
        const result = sqlite.prepare(sql).run(...params)
        return { meta: { changes: result.changes } } as D1Result<unknown>
      }
      return {
        executeSync,
        run: async () => executeSync(),
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...params) as T[] } as D1Result<T>
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null
        },
      }
    },
  })
  return { prepare } as unknown as D1Database
}

function continuingAt(nextOffset: number): SyncRepoStats {
  return {
    status: 'continuing',
    skillsSeen: nextOffset + 1,
    skillsUpserted: 0,
    continuation: { treeSha: 'tree-1', checkedAt: 1_700_000_000, nextOffset },
  } as unknown as SyncRepoStats
}

function jobContext(db: D1Database) {
  const control: { action: string | null, error: string | null, delaySeconds: number | null } = {
    action: null,
    error: null,
    delaySeconds: null,
  }
  return {
    control,
    ctx: {
      env: {} as never,
      db,
      log: console,
      jobId: 'job-1',
      batchId: null,
      attempt: 1,
      async release(delaySeconds: number) {
        control.action = 'released'
        control.delaySeconds = delaySeconds
      },
      async fail(error: string) {
        control.action = 'failed'
        control.error = error
      },
      reportStats() {},
    },
  }
}

describe('repo sync continuation', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    syncRepo.mockReset()
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repo_sync_progress (
        owner TEXT, repo TEXT, job_id TEXT, tree_sha TEXT, checked_at INTEGER,
        next_offset INTEGER, total_skills INTEGER, updated_at INTEGER,
        PRIMARY KEY (owner, repo)
      );
    `)
    db = wrapSqlite(sqlite)
  })

  const payload = {
    operation: 'sync',
    owner: 'acme',
    repo: 'skills',
    ownerVerified: false,
    claimDiscovery: false,
  } as const

  it('keeps a repository moving while it is under the indexable ceiling', async () => {
    syncRepo.mockResolvedValue(continuingAt(250))
    const { ctx, control } = jobContext(db)

    await handleRegistryRepoJob({ ...payload }, ctx as never)

    expect(control.action).toBe('released')
    expect(sqlite.prepare('SELECT next_offset FROM repo_sync_progress').get())
      .toMatchObject({ next_offset: 250 })
  })

  it('rejects a repository by name once it passes the ceiling, instead of paginating forever', async () => {
    syncRepo.mockResolvedValue(continuingAt(20_000))
    const { ctx, control } = jobContext(db)

    await handleRegistryRepoJob({ ...payload }, ctx as never)

    expect(control.action).toBe('failed')
    expect(control.error).toBe('repo_too_large_to_index')
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM repo_sync_progress').get())
      .toMatchObject({ count: 0 })
  })

  it('asks syncRepo for more than one memory slice per invocation', async () => {
    syncRepo.mockResolvedValue(continuingAt(250))
    const { ctx } = jobContext(db)

    await handleRegistryRepoJob({ ...payload }, ctx as never)

    const options = syncRepo.mock.calls[0]?.[4] as { maxSkillFiles: number }
    expect(options.maxSkillFiles).toBeGreaterThan(50)
  })
})
