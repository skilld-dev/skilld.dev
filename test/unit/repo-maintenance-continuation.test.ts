import type { SyncRepoStats } from '../../layers/registry/server/utils/sync-repo'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TERMINAL_DISCOVERY_REJECTION_REASONS } from '../../layers/registry/server/utils/discovery-candidates'

const syncRepo = vi.fn<(...args: unknown[]) => Promise<SyncRepoStats>>()
const purposeAdmission = vi.fn()

vi.mock('../../layers/registry/server/utils/repository-purpose-effect', () => ({
  checkRepositoryPurposeAdmission: (...args: unknown[]) => purposeAdmission(...args),
  readRepositoryPurposeEvidence: vi.fn(),
  refreshRepositoryPurpose: vi.fn(),
}))

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

function failedWith(reason: string): SyncRepoStats {
  return {
    status: 'failed',
    reason,
    skillsSeen: 0,
    skillsUpserted: 0,
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
    purposeAdmission.mockReset()
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

  it('holds a new submission before syncing and releases its progress claim', async () => {
    purposeAdmission.mockResolvedValue({ _tag: 'held', reason: 'repository_purpose_review_required' })
    const { ctx, control } = jobContext(db)
    await handleRegistryRepoJob({ operation: 'submit', owner: 'acme', repo: 'directory' }, ctx as never)
    expect(control).toMatchObject({ action: 'failed', error: 'repository_purpose_review_required' })
    expect(syncRepo).not.toHaveBeenCalled()
    expect(sqlite.prepare('SELECT * FROM repo_sync_progress').all()).toEqual([])
  })

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

describe('permanent repository failures on the sync path', () => {
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

  const syncPayload = {
    operation: 'sync',
    owner: 'chadking-agent',
    repo: 'sia',
    ownerVerified: false,
    claimDiscovery: false,
  } as const

  it('ends a deleted repository on the first answer instead of retrying a 404', async () => {
    syncRepo.mockResolvedValue(failedWith('repo fetch 404'))
    const { ctx, control } = jobContext(db)

    await handleRegistryRepoJob({ ...syncPayload }, ctx as never)

    expect(control.action).toBe('failed')
    expect(control.error).toBe('repo fetch 404')
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM repo_sync_progress').get())
      .toMatchObject({ count: 0 })
  })

  it('ends an identity conflict without retrying or retaining continuation progress', async () => {
    const reason = 'move_refused: acme/skills is Repository 1 on GitHub, and the registry holds that name for Repository 111'
    syncRepo.mockResolvedValue(failedWith(reason))
    const { ctx, control } = jobContext(db)

    await handleRegistryRepoJob({ ...syncPayload }, ctx as never)

    expect(control.action).toBe('failed')
    expect(control.error).toBe(reason)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM repo_sync_progress').get())
      .toMatchObject({ count: 0 })
  })

  it('records the bare reason the health check compares against', async () => {
    syncRepo.mockResolvedValue(failedWith('repo fetch 410'))
    const { ctx, control } = jobContext(db)

    await handleRegistryRepoJob({ ...syncPayload }, ctx as never)

    // The exclusion is an equality test against the reason. A thrown error
    // stringifies to `Error: repo fetch 410` plus a stack and never matches,
    // which is how two deleted repositories turned the operator report RED.
    expect(TERMINAL_DISCOVERY_REJECTION_REASONS).toContain(control.error)
  })

  it('still throws a transient failure so the queue retries it', async () => {
    syncRepo.mockResolvedValue(failedWith('tree_fetch_failed:503'))
    const { ctx, control } = jobContext(db)

    await expect(handleRegistryRepoJob({ ...syncPayload }, ctx as never))
      .rejects
      .toThrow('tree_fetch_failed:503')
    expect(control.action).toBeNull()
  })
})
