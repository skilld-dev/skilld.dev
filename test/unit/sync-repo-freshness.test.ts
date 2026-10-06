import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncRepo } from '../../layers/registry/server/utils/sync-repo'

const github = vi.hoisted(() => ({
  getBlobsBatch: vi.fn(),
  getCommitsBatch: vi.fn(),
  getRepoSummary: vi.fn(),
  getTree: vi.fn(),
  logRateLimit: vi.fn(),
}))

vi.mock('../../layers/registry/server/utils/github-client', () => github)

function repoSummary(headTreeSha: string | null = 'same-tree', stars = 42) {
  return {
    status: 200,
    data: {
      repositoryId: 1,
      headTreeSha,
      meta: {
        name: 'skills',
        full_name: 'acme/skills',
        html_url: 'https://github.com/acme/skills',
        owner: { login: 'acme' },
        default_branch: 'trunk',
        description: 'Skills',
        stargazers_count: stars,
        forks_count: 7,
        pushed_at: '2026-07-12T12:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      },
    },
    rateLimit: null,
    notModified: false,
  }
}

describe('syncRepo freshness cursor', () => {
  let sqlite: Database.Database
  let db: D1Database
  let statements: string[]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T00:00:00Z'))
    vi.clearAllMocks()

    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        current_sha TEXT,
        modified_at INTEGER,
        first_seen_at INTEGER,
        last_synced_at INTEGER,
        sync_status TEXT,
        source_resolved INTEGER,
        seo_index_score INTEGER NOT NULL DEFAULT 0,
        seo_indexable INTEGER NOT NULL DEFAULT 0,
        seo_index_reasons TEXT NOT NULL DEFAULT '[]',
        seo_index_synced_at INTEGER,
        trust_tier TEXT NOT NULL DEFAULT 'untrusted',
        trust_source TEXT NOT NULL DEFAULT 'computed',
        trust_score INTEGER NOT NULL DEFAULT 0,
        trust_reasons TEXT NOT NULL DEFAULT '[]',
        trust_synced_at INTEGER,
        owner_verified INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        default_branch TEXT,
        stars INTEGER NOT NULL DEFAULT 0,
        forks INTEGER NOT NULL DEFAULT 0,
        pushed_at INTEGER,
        repo_created_at INTEGER,
        repo_meta_synced_at INTEGER,
        description TEXT,
        last_tree_sha TEXT,
        broken_since INTEGER,
        tree_truncated_at INTEGER,
        source_owner TEXT,
        source_repo TEXT,
        repository_id INTEGER,
        PRIMARY KEY (owner, repo)
      );
      INSERT INTO repos (
        owner, repo, default_branch, stars, forks, pushed_at, repo_created_at,
        repo_meta_synced_at, last_tree_sha, broken_since
      ) VALUES
        ('acme', 'skills', 'main', 1, 1, 100, 50, 75, 'same-tree', NULL);
      INSERT INTO skills (owner, repo, name, current_sha, owner_verified)
      VALUES ('acme', 'skills', 'one', 'skill-sha', 0);
      CREATE TABLE skill_dirty (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        reason TEXT NOT NULL,
        queued_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner, repo, name, reason)
      );
      CREATE TABLE repo_star_observations (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        observed_day INTEGER NOT NULL,
        stars INTEGER NOT NULL,
        PRIMARY KEY (owner, repo, observed_day)
      );
    `)
    statements = []
    db = wrapSqlite(sqlite, statements)

    github.getRepoSummary.mockResolvedValue(repoSummary())
  })

  afterEach(() => {
    vi.useRealTimers()
    sqlite.close()
  })

  it('advances repo metadata freshness on the GraphQL tree-SHA skip path', async () => {
    const result = await syncRepo('acme', 'skills', {}, db)
    const row = sqlite.prepare(`
      SELECT default_branch, stars, forks, pushed_at, repo_created_at,
             repo_meta_synced_at, broken_since
      FROM repos WHERE owner = 'acme' AND repo = 'skills'
    `).get()

    expect(result.status).toBe('skipped-tree-sha')
    expect(github.getTree).not.toHaveBeenCalled()
    expect(statements.some(sql => sql.includes('SELECT name, current_sha'))).toBe(false)
    expect(row).toEqual({
      default_branch: 'trunk',
      stars: 42,
      forks: 7,
      pushed_at: 1783857600,
      repo_created_at: 1735689600,
      repo_meta_synced_at: 1783900800,
      broken_since: null,
    })
    expect(sqlite.prepare(`SELECT observed_day, stars FROM repo_star_observations`).get()).toEqual({
      observed_day: 1783900800,
      stars: 42,
    })
  })

  it('keeps one exact observation per UTC day and updates that day in place', async () => {
    await syncRepo('acme', 'skills', {}, db)
    github.getRepoSummary.mockResolvedValue(repoSummary('same-tree', 43))
    await syncRepo('acme', 'skills', {}, db)

    expect(sqlite.prepare(`SELECT observed_day, stars FROM repo_star_observations`).all()).toEqual([
      { observed_day: 1783900800, stars: 43 },
    ])

    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'))
    github.getRepoSummary.mockResolvedValue(repoSummary('same-tree', 44))
    await syncRepo('acme', 'skills', {}, db)

    expect(sqlite.prepare(`SELECT observed_day, stars FROM repo_star_observations ORDER BY observed_day`).all()).toEqual([
      { observed_day: 1783900800, stars: 43 },
      { observed_day: 1783987200, stars: 44 },
    ])
  })

  it('prunes observations outside the rolling 90 day window', async () => {
    await syncRepo('acme', 'skills', {}, db)

    vi.setSystemTime(new Date('2026-10-11T00:00:00Z'))
    github.getRepoSummary.mockResolvedValue(repoSummary('same-tree', 50))
    await syncRepo('acme', 'skills', {}, db)

    expect(sqlite.prepare(`SELECT observed_day, stars FROM repo_star_observations`).all()).toEqual([
      { observed_day: 1791676800, stars: 50 },
    ])
  })

  it('also advances freshness when the REST tree confirms no change', async () => {
    sqlite.prepare(`UPDATE repos SET pushed_at = 0`).run()
    github.getRepoSummary.mockResolvedValueOnce(repoSummary(null))
    github.getTree.mockResolvedValue({
      status: 200,
      data: { sha: 'same-tree', tree: [] },
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db)
    const checkedAt = sqlite
      .prepare(`SELECT repo_meta_synced_at FROM repos WHERE owner = 'acme' AND repo = 'skills'`)
      .pluck()
      .get()

    expect(result.status).toBe('skipped-tree-sha')
    expect(github.getTree).toHaveBeenCalledOnce()
    expect(statements.some(sql => sql.includes('SELECT name, current_sha'))).toBe(false)
    expect(checkedAt).toBe(1783900800)
  })

  it('records the too-large verdict when GitHub truncates the tree', async () => {
    github.getRepoSummary.mockResolvedValue(repoSummary('moved-tree'))
    github.getTree.mockResolvedValue({
      status: 200,
      data: { sha: 'big-tree', truncated: true, tree: [] },
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db)
    const row = sqlite.prepare(`
      SELECT repo_meta_synced_at, last_tree_sha, tree_truncated_at, broken_since
      FROM repos WHERE owner = 'acme' AND repo = 'skills'
    `).get()

    expect(result.status).toBe('failed')
    expect(result.reason).toBe('tree_truncated')
    expect(row).toEqual({
      repo_meta_synced_at: 1783900800,
      last_tree_sha: 'same-tree',
      tree_truncated_at: 1783900800,
      broken_since: null,
    })
    expect(statements.some(sql => sql.includes('SELECT name, current_sha'))).toBe(false)
  })

  it('clears a stale too-large verdict once the repo syncs clean', async () => {
    sqlite.prepare(`UPDATE repos SET tree_truncated_at = 123`).run()

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result.status).toBe('skipped-tree-sha')
    expect(sqlite
      .prepare(`SELECT tree_truncated_at FROM repos WHERE owner = 'acme' AND repo = 'skills'`)
      .pluck()
      .get()).toBeNull()
  })

  it('applies owner verification and queues exact recomputation on an unchanged tree', async () => {
    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result.status).toBe('verified-only')
    expect(sqlite.prepare(`SELECT owner_verified FROM skills`).pluck().get()).toBe(1)
    expect(sqlite.prepare(`SELECT owner, repo, name, reason FROM skill_dirty`).get()).toEqual({
      owner: 'acme',
      repo: 'skills',
      name: 'one',
      reason: 'owner_verified',
    })
  })

  it('records repo_missing without overwriting a path_missing verdict', async () => {
    sqlite.prepare(`UPDATE skills SET sync_status = 'path_missing', source_resolved = 0`).run()
    github.getRepoSummary.mockResolvedValue({ status: 404, data: null, rateLimit: null, notModified: false })

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result.status).toBe('failed')
    expect(result.reason).toBe('repo fetch 404')
    expect(sqlite.prepare(`SELECT sync_status FROM skills`).pluck().get()).toBe('path_missing')
    expect(sqlite
      .prepare(`SELECT broken_since FROM repos WHERE owner = 'acme' AND repo = 'skills'`)
      .pluck()
      .get()).toBe(1783900800)
  })

  it('restores repo_missing skills once a broken repo answers again unchanged', async () => {
    sqlite.prepare(`UPDATE repos SET broken_since = 1783812000`).run()
    sqlite.prepare(`
      INSERT INTO skills (owner, repo, name, current_sha, sync_status, source_resolved)
      VALUES ('acme', 'skills', 'gone', 'gone-sha', 'path_missing', 0)
    `).run()
    sqlite.prepare(`
      UPDATE skills
      SET sync_status = 'repo_missing', source_resolved = 0, last_synced_at = 1783812000
      WHERE sync_status IS NULL
    `).run()

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result.status).toBe('skipped-tree-sha')
    expect(sqlite.prepare(`
      SELECT name, sync_status, source_resolved, last_synced_at
      FROM skills ORDER BY name
    `).all()).toEqual([
      { name: 'gone', sync_status: 'path_missing', source_resolved: 0, last_synced_at: null },
      { name: 'one', sync_status: 'ok', source_resolved: 1, last_synced_at: 1783900800 },
    ])
    expect(sqlite
      .prepare(`SELECT broken_since FROM repos WHERE owner = 'acme' AND repo = 'skills'`)
      .pluck()
      .get()).toBeNull()
  })

  it('restores repo_missing skills on the owner-verified unchanged path too', async () => {
    sqlite.prepare(`UPDATE skills SET sync_status = 'repo_missing', source_resolved = 0`).run()

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result.status).toBe('verified-only')
    expect(sqlite.prepare(`SELECT sync_status, source_resolved FROM skills`).get()).toEqual({
      sync_status: 'ok',
      source_resolved: 1,
    })
  })
})

function wrapSqlite(sqlite: Database.Database, statements: string[]): D1Database {
  return {
    prepare(sql: string) {
      statements.push(sql)
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              const result = sqlite.prepare(sql).run(...params)
              return { meta: { changes: result.changes } }
            },
            async all<T>() {
              return { results: sqlite.prepare(sql).all(...params) as T[] }
            },
            async first<T>() {
              return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null
            },
          }
        },
      }
    },
    async batch(batchStatements: Array<{ run: () => Promise<unknown> }>) {
      const transaction = sqlite.transaction(() => batchStatements.map(statement => statement.run()))
      return await Promise.all(transaction())
    },
  } as unknown as D1Database
}
