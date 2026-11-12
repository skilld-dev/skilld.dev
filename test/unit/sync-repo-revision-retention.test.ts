import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SKILL_REVISION_RETAIN, syncRepo } from '../../layers/registry/server/utils/sync-repo'

/**
 * ADR-0019: `skill_revisions` keeps the newest `SKILL_REVISION_RETAIN` rows per
 * Skill. A changed body inserts its commits and then drops what falls past
 * the window, in the same batch.
 */

const github = vi.hoisted(() => ({
  getBlobsBatch: vi.fn(),
  getCommitsBatch: vi.fn(),
  getRepoSummary: vi.fn(),
  getTree: vi.fn(),
  logRateLimit: vi.fn(),
}))
const renderer = vi.hoisted(() => ({
  parseSkillMd: vi.fn(async (raw: string) => ({ frontmatter: {}, body: raw, html: `<p>${raw}</p>` })),
}))

vi.mock('../../layers/registry/server/utils/github-client', () => github)
vi.mock('../../layers/registry/server/utils/skill-md-render', () => renderer)

const rawSkill = (name: string) => `---\nname: ${name}\ndescription: ${name} description\n---\n# ${name}`

function commit(index: number) {
  return {
    sha: `sha-${String(index).padStart(3, '0')}`,
    author: { login: 'author' },
    commit: { message: `commit ${index}`, author: { date: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString() } },
  }
}

describe('syncRepo revision retention', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-12T00:00:00Z'))
    vi.clearAllMocks()
    sqlite = createDatabase()
    db = wrapSqlite(sqlite)
    github.getRepoSummary.mockResolvedValue({
      status: 200,
      data: {
        repositoryId: 1,
        headTreeSha: 'new-tree',
        meta: {
          name: 'skills',
          full_name: 'acme/skills',
          html_url: 'https://github.com/acme/skills',
          owner: { login: 'acme' },
          default_branch: 'main',
          description: 'Skills',
          stargazers_count: 1,
          forks_count: 0,
          pushed_at: '2026-11-11T12:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
        },
      },
      rateLimit: null,
      notModified: false,
    })
    github.getTree.mockResolvedValue({
      status: 200,
      data: { sha: 'new-tree', tree: [{ path: 'skills/one/SKILL.md', sha: 'one-new', type: 'blob' }] },
      rateLimit: null,
      notModified: false,
    })
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })
    sqlite.prepare(`INSERT INTO repos (owner, repo, default_branch, pushed_at, last_tree_sha) VALUES ('acme', 'skills', 'main', 0, 'old-tree')`).run()
  })

  afterEach(() => {
    vi.useRealTimers()
    sqlite.close()
  })

  it('keeps only the newest revisions per Skill after a sync', async () => {
    // Older rows from earlier syncs, below the window once new commits land.
    const insert = sqlite.prepare(`INSERT INTO skill_revisions (owner, repo, name, sha, modified_at, author_login, message) VALUES ('acme', 'skills', 'one', ?, ?, 'author', ?)`)
    for (let i = 0; i < 10; i += 1)
      insert.run(`old-${i}`, 1_000 + i, `old ${i}`)
    const newest = Array.from({ length: SKILL_REVISION_RETAIN }, (_, i) => commit(100 + i)).reverse()
    github.getCommitsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', newest]]),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result.status).toBe('indexed')
    const shas = sqlite.prepare(`SELECT sha FROM skill_revisions WHERE name = 'one' ORDER BY modified_at DESC`).pluck().all()
    expect(shas).toHaveLength(SKILL_REVISION_RETAIN)
    expect(shas[0]).toBe(newest[0]!.sha)
    expect(shas.some(sha => String(sha).startsWith('old-'))).toBe(false)
  })

  it('leaves a Skill with few revisions alone', async () => {
    github.getCommitsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', [commit(2), commit(1)]]]),
      rateLimit: null,
      notModified: false,
    })

    await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(sqlite.prepare(`SELECT sha FROM skill_revisions ORDER BY modified_at DESC`).pluck().all()).toEqual(['sha-002', 'sha-001'])
  })
})

function createDatabase(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE repos (
      owner TEXT NOT NULL, repo TEXT NOT NULL, default_branch TEXT, stars INTEGER NOT NULL DEFAULT 0,
      forks INTEGER NOT NULL DEFAULT 0, pushed_at INTEGER, repo_created_at INTEGER,
      repo_meta_synced_at INTEGER, description TEXT, last_tree_sha TEXT, repo_kind TEXT NOT NULL DEFAULT 'creator',
      repo_kind_source TEXT NOT NULL DEFAULT 'computed', repo_skill_count INTEGER NOT NULL DEFAULT 0,
      broken_since INTEGER, tree_truncated_at INTEGER, source_owner TEXT, source_repo TEXT, repository_id INTEGER, is_fork INTEGER, PRIMARY KEY (owner, repo)
    );
    CREATE TABLE skills (
      name TEXT NOT NULL, owner TEXT NOT NULL, repo TEXT NOT NULL, display_name TEXT NOT NULL,
      installs INTEGER NOT NULL DEFAULT 0, slug TEXT NOT NULL, description TEXT, current_sha TEXT,
      modified_at INTEGER, first_seen_at INTEGER, references_count INTEGER NOT NULL DEFAULT 0,
      assets TEXT NOT NULL DEFAULT '[]', last_synced_at INTEGER, sync_status TEXT,
      is_official INTEGER NOT NULL DEFAULT 0, source_resolved INTEGER NOT NULL DEFAULT 0,
      seo_index_score INTEGER NOT NULL DEFAULT 0, seo_indexable INTEGER NOT NULL DEFAULT 0,
      seo_index_reasons TEXT NOT NULL DEFAULT '[]', seo_index_synced_at INTEGER,
      trust_tier TEXT NOT NULL DEFAULT 'untrusted', trust_source TEXT NOT NULL DEFAULT 'computed',
      trust_score INTEGER NOT NULL DEFAULT 0, trust_reasons TEXT NOT NULL DEFAULT '[]', trust_synced_at INTEGER,
      rendered_skill_path TEXT, rendered_commit_sha TEXT, rendered_status TEXT, rendered_raw TEXT, rendered_raw_sha256 TEXT, rendered_frontmatter TEXT,
      rendered_html TEXT, rendered_at INTEGER, owner_verified INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (owner, repo, name)
    );
    CREATE TABLE skill_revisions (
      owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL, sha TEXT NOT NULL,
      modified_at INTEGER NOT NULL, author_login TEXT, message TEXT,
      PRIMARY KEY (owner, repo, name, sha)
    );
    CREATE TABLE activity (
      type TEXT NOT NULL, owner TEXT NOT NULL, repo TEXT, name TEXT NOT NULL,
      occurred_at INTEGER NOT NULL, ingested_at INTEGER NOT NULL, sha TEXT
    );
    CREATE TABLE skill_dirty (
      owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL, reason TEXT NOT NULL,
      queued_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (owner, repo, name, reason)
    );
    CREATE TABLE repo_trust_overrides (
      owner TEXT NOT NULL, repo TEXT NOT NULL, tier TEXT NOT NULL, reason TEXT,
      PRIMARY KEY (owner, repo)
    );
    CREATE TABLE repo_kind_overrides (
      owner TEXT NOT NULL, repo TEXT NOT NULL, kind TEXT NOT NULL,
      PRIMARY KEY (owner, repo)
    );
    CREATE TABLE skill_repo_eligibility (
      owner TEXT NOT NULL, repo TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('eligible', 'rejected')),
      reason TEXT NOT NULL, reviewed_by TEXT NOT NULL,
      reviewed_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (owner, repo)
    );
    CREATE TABLE repo_star_observations (
      owner TEXT NOT NULL, repo TEXT NOT NULL, observed_day INTEGER NOT NULL,
      stars INTEGER NOT NULL, PRIMARY KEY (owner, repo, observed_day)
    );
  `)
  return sqlite
}

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
  return {
    prepare,
    async batch<T>(statements: D1PreparedStatement[]) {
      const run = sqlite.transaction(() => statements.map(statement => (statement as unknown as BoundStatement).executeSync()))
      return run() as D1Result<T>[]
    },
  } as unknown as D1Database
}
