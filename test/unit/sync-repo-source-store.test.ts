import type { SkillSourceBucket } from '../../layers/registry/server/utils/skill-source-store'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { skillContentSha256 } from '../../layers/registry/server/utils/skill-content-hash'
import { skillSourceR2Key } from '../../layers/registry/server/utils/skill-source-store'
import { syncRepo } from '../../layers/registry/server/utils/sync-repo'

/**
 * ADR-0019: a changed SKILL.md body goes to R2 under its SHA-256 before the
 * D1 row that names that hash is written. During the dual-write phase the
 * row keeps its own copy, so an R2 failure must not fail the sync.
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

describe('syncRepo with a skill source bucket', () => {
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
    github.getCommitsBatch.mockImplementation(async (_owner: string, _repo: string, paths: string[]) => ({
      status: 200,
      data: new Map(paths.map(path => [path, []])),
      rateLimit: null,
      notModified: false,
    }))
    sqlite.prepare(`INSERT INTO repos (owner, repo, default_branch, pushed_at, last_tree_sha) VALUES ('acme', 'skills', 'main', 0, 'old-tree')`).run()
  })

  afterEach(() => {
    vi.useRealTimers()
    sqlite.close()
  })

  it('puts the body to R2 under the hash the row records', async () => {
    const bucket = memoryBucket()

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true, sourceBucket: bucket })

    expect(result).toMatchObject({ status: 'indexed', sourcesStored: 1 })
    const row = sqlite.prepare(`SELECT rendered_raw, rendered_raw_sha256 FROM skills`).get() as { rendered_raw: string, rendered_raw_sha256: string }
    expect(row.rendered_raw_sha256).toBe(await skillContentSha256(rawSkill('One')))
    const object = bucket.objects.get(skillSourceR2Key(row.rendered_raw_sha256))
    expect(object && new TextDecoder().decode(object)).toBe(row.rendered_raw)
  })

  it('keeps the D1 row when the put fails and counts the failure', async () => {
    const bucket = memoryBucket(true)

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true, sourceBucket: bucket })

    expect(result).toMatchObject({ status: 'indexed', sourceStoreFailures: 1 })
    expect(result.sourcesStored).toBeUndefined()
    expect(sqlite.prepare(`SELECT rendered_raw FROM skills`).pluck().get()).toBe(rawSkill('One'))
  })

  it('writes D1 only when no bucket is given', async () => {
    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result).toMatchObject({ status: 'indexed' })
    expect(result.sourcesStored).toBeUndefined()
    expect(sqlite.prepare(`SELECT rendered_raw FROM skills`).pluck().get()).toBe(rawSkill('One'))
  })
})

function memoryBucket(failPut = false): SkillSourceBucket & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    put: (async (key: string, value: Uint8Array) => {
      if (failPut)
        throw new Error('r2 unavailable')
      objects.set(key, value)
      return { key }
    }) as unknown as SkillSourceBucket['put'],
    get: (async () => null) as unknown as SkillSourceBucket['get'],
    head: (async () => null) as unknown as SkillSourceBucket['head'],
  }
}

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
