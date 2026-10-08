import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncRepo } from '../../layers/registry/server/utils/sync-repo'

/**
 * Production evidence (2026-08-06): `lev-os/agents` holds 2,853 SKILL.md files
 * and has been entirely unindexed since 2026-07-29. One of those files,
 * `skills-db/thinking/patterns/opportunity-solution-trees/SKILL.md`, carries 32
 * NUL bytes and other control characters inside an ASCII diagram, so GitHub
 * classifies it as binary and its GraphQL `text` field comes back null. The
 * blob batch was therefore short on every attempt, `syncRepo` read that as a
 * partial response and failed the whole repository, and the discovery candidate
 * burned five retries against a property of the file that no retry can change.
 *
 * A blob GitHub refuses to hand back as text is not a blob that went missing.
 * Absent is retryable; unreadable is terminal for that one file and irrelevant
 * to every other file in the repository.
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

function repoSummary(headTreeSha: string | null = 'new-tree') {
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
        default_branch: 'main',
        description: 'Skills',
        stargazers_count: 1,
        forks_count: 0,
        pushed_at: '2026-07-12T12:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      },
    },
    rateLimit: null,
    notModified: false,
  }
}

function tree(entries: Array<{ path: string, sha: string }>, sha = 'new-tree') {
  return {
    status: 200,
    data: { sha, tree: entries.map(entry => ({ ...entry, type: 'blob' })) },
    rateLimit: null,
    notModified: false,
  }
}

function blobs(texts: Array<[string, string]>, unreadable: string[] = []) {
  return {
    status: 200,
    data: new Map(texts),
    unreadable: new Set(unreadable),
    rateLimit: null,
    notModified: false,
  }
}

describe('syncRepo with an unreadable blob', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T00:00:00Z'))
    vi.clearAllMocks()
    sqlite = createDatabase()
    db = wrapSqlite(sqlite)
    github.getRepoSummary.mockResolvedValue(repoSummary())
    github.getCommitsBatch.mockImplementation(async (_owner: string, _repo: string, paths: string[]) => ({
      status: 200,
      data: new Map(paths.map(path => [path, []])),
      rateLimit: null,
      notModified: false,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    sqlite.close()
  })

  it('indexes every readable skill instead of failing the repository', async () => {
    insertRepo(sqlite, 'old-tree')
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/one/SKILL.md', sha: 'one-new' },
      { path: 'skills/binary/SKILL.md', sha: 'binary-new' },
      { path: 'skills/two/SKILL.md', sha: 'two-new' },
    ]))
    github.getBlobsBatch.mockResolvedValue(blobs([
      ['skills/one/SKILL.md', rawSkill('One')],
      ['skills/two/SKILL.md', rawSkill('Two')],
    ], ['skills/binary/SKILL.md']))

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result.status).toBe('indexed')
    expect(result.reason).toBeUndefined()
    expect(sqlite.prepare(`SELECT name FROM skills ORDER BY name`).pluck().all()).toEqual(['one', 'two'])
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('new-tree')
  })

  it('still fails the batch when a blob is genuinely absent', async () => {
    insertRepo(sqlite, 'old-tree')
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/one/SKILL.md', sha: 'one-new' },
      { path: 'skills/two/SKILL.md', sha: 'two-new' },
    ]))
    github.getBlobsBatch.mockResolvedValue(blobs([['skills/one/SKILL.md', rawSkill('One')]]))

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result).toMatchObject({ status: 'failed', reason: 'blob_batch_partial:skills/two/SKILL.md' })
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('old-tree')
  })

  it('does not quarantine an already-indexed skill whose file became unreadable', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    insertSkill(sqlite, 'two', 'two-old')
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/one/SKILL.md', sha: 'one-new' },
      { path: 'skills/two/SKILL.md', sha: 'two-new' },
    ]))
    github.getBlobsBatch.mockResolvedValue(blobs(
      [['skills/one/SKILL.md', rawSkill('One')]],
      ['skills/two/SKILL.md'],
    ))

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result.status).toBe('indexed')
    // `two` is unreadable, not gone. Quarantining it would delist a live skill
    // over a file GitHub simply refuses to hand back as text.
    expect(sqlite.prepare(`SELECT name, source_resolved, trust_tier FROM skills ORDER BY name`).all()).toEqual([
      { name: 'one', source_resolved: 1, trust_tier: 'untrusted' },
      { name: 'two', source_resolved: 1, trust_tier: 'untrusted' },
    ])
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
      broken_since INTEGER, tree_truncated_at INTEGER, source_owner TEXT, source_repo TEXT, repository_id INTEGER, PRIMARY KEY (owner, repo)
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

function insertRepo(sqlite: Database.Database, treeSha: string): void {
  sqlite.prepare(
    `INSERT INTO repos (owner, repo, default_branch, pushed_at, last_tree_sha)
     VALUES ('acme', 'skills', 'main', 0, ?)`,
  ).run(treeSha)
}

function insertSkill(sqlite: Database.Database, name: string, sha: string): void {
  sqlite.prepare(
    `INSERT INTO skills (
       owner, repo, name, display_name, slug, current_sha, first_seen_at, source_resolved
     ) VALUES ('acme', 'skills', ?, ?, ?, ?, 1, 1)`,
  ).run(name, name, `acme/${name}`, sha)
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
