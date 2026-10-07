import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SKILL_SLICE_SIZE, syncRepo } from '../../layers/registry/server/utils/sync-repo'

const github = vi.hoisted(() => ({
  getBlobsBatch: vi.fn(),
  getCommitsBatch: vi.fn(),
  getRepoSummary: vi.fn(),
  getTree: vi.fn(),
  logRateLimit: vi.fn(),
}))

vi.mock('../../layers/registry/server/utils/github-client', () => github)
vi.mock('../../layers/registry/server/utils/skill-md-render', () => ({
  parseSkillMd: vi.fn(async (raw: string) => ({ frontmatter: {}, body: raw, html: `<p>${raw}</p>` })),
}))

const rawSkill = (name: string) => `---\nname: ${name}\ndescription: ${name} description\n---\n# ${name}`

function repoSummary() {
  return {
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
        pushed_at: '2026-07-12T12:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      },
    },
    rateLimit: null,
    notModified: false,
  }
}

/** A repo with `count` nested skills, one slice-crossing tree. */
function bigTree(count: number) {
  return {
    status: 200,
    data: {
      sha: 'new-tree',
      tree: Array.from({ length: count }, (_, i) => ({
        path: `skills/s${i}/SKILL.md`,
        sha: `sha-${i}`,
        type: 'blob',
      })),
    },
    rateLimit: null,
    notModified: false,
  }
}

/** Serve only the paths asked for, so the mock cannot hide an over-large request. */
function serveRequestedBlobs() {
  return async (_owner: string, _repo: string, _branch: string, paths: string[]) => ({
    status: 200,
    data: new Map(paths.map(path => [path, rawSkill(path.split('/')[1]!)])),
    unreadable: new Set(),
    rateLimit: null,
    notModified: false,
  })
}

describe('syncRepo bounded working set', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T00:00:00Z'))
    vi.clearAllMocks()
    sqlite = createDatabase()
    db = wrapSqlite(sqlite)
    github.getRepoSummary.mockResolvedValue(repoSummary())
    github.getCommitsBatch.mockImplementation(async (_owner, _repo, paths: string[]) => ({
      status: 200,
      data: new Map(paths.map(path => [path, []])),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    sqlite.close()
  })

  // The 2026-07-26 outage: chunking bounded the GraphQL *query* but every chunk
  // result was merged into one repo-wide Map, so an 890-skill repo materialised
  // every SKILL.md at once and the isolate died with exceededMemory.
  it('never asks for more than one slice of blob content at a time', async () => {
    insertRepo(sqlite, 'old-tree')
    const count = SKILL_SLICE_SIZE * 4 + 7
    github.getTree.mockResolvedValue(bigTree(count))
    github.getBlobsBatch.mockImplementation(serveRequestedBlobs())

    await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    const requestedPerCall = github.getBlobsBatch.mock.calls.map(call => (call[3] as string[]).length)
    expect(requestedPerCall.length).toBe(Math.ceil(count / SKILL_SLICE_SIZE))
    expect(Math.max(...requestedPerCall)).toBeLessThanOrEqual(SKILL_SLICE_SIZE)
    expect(requestedPerCall.reduce((a, b) => a + b, 0)).toBe(count)
  })

  it('bounds commit history requests to the same slice', async () => {
    insertRepo(sqlite, 'old-tree')
    const count = SKILL_SLICE_SIZE * 3
    github.getTree.mockResolvedValue(bigTree(count))
    github.getBlobsBatch.mockImplementation(serveRequestedBlobs())

    await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    const requestedPerCall = github.getCommitsBatch.mock.calls.map(call => (call[2] as string[]).length)
    expect(Math.max(...requestedPerCall)).toBeLessThanOrEqual(SKILL_SLICE_SIZE)
  })

  it('indexes every skill in a repo many slices wide', async () => {
    insertRepo(sqlite, 'old-tree')
    const count = SKILL_SLICE_SIZE * 3 + 1
    github.getTree.mockResolvedValue(bigTree(count))
    github.getBlobsBatch.mockImplementation(serveRequestedBlobs())

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result.status).toBe('indexed')
    expect(result.skillsUpserted).toBe(count)
    expect(sqlite.prepare(`SELECT count(*) FROM skills`).pluck().get()).toBe(count)
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('new-tree')
    expect(sqlite.prepare(`SELECT repo_skill_count FROM repos`).pluck().get()).toBe(count)
  })

  it('admits a submitted skill without claiming owner verification', async () => {
    github.getTree.mockResolvedValue(bigTree(1))
    github.getBlobsBatch.mockImplementation(serveRequestedBlobs())

    const result = await syncRepo('acme', 'skills', {}, db, { submitted: true })

    expect(result).toMatchObject({ status: 'indexed', skillsUpserted: 1 })
    expect(sqlite.prepare(
      `SELECT name, owner_verified FROM skills`,
    ).get()).toEqual({ name: 's0', owner_verified: 0 })
  })

  it('does not acknowledge the tree when a later slice fails', async () => {
    insertRepo(sqlite, 'old-tree')
    github.getTree.mockResolvedValue(bigTree(SKILL_SLICE_SIZE * 2))
    let call = 0
    github.getBlobsBatch.mockImplementation(async (_o: string, _r: string, _b: string, paths: string[]) => {
      call += 1
      if (call > 1)
        return { status: 502, data: null, rateLimit: null, notModified: false }
      return {
        status: 200,
        data: new Map(paths.map(path => [path, rawSkill(path.split('/')[1]!)])),
        unreadable: new Set(),
        rateLimit: null,
        notModified: false,
      }
    })

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result).toMatchObject({ status: 'failed', reason: 'blob_batch_failed:502' })
    // The cursor is the whole-repo acknowledgement. A partial pass must never
    // advance it, or the next run would skip the slices it never read.
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('old-tree')
  })

  it('keeps slices already written when a later slice fails, so retries make progress', async () => {
    insertRepo(sqlite, 'old-tree')
    github.getTree.mockResolvedValue(bigTree(SKILL_SLICE_SIZE * 2))
    let call = 0
    github.getBlobsBatch.mockImplementation(async (_o: string, _r: string, _b: string, paths: string[]) => {
      call += 1
      if (call > 1)
        return { status: 502, data: null, rateLimit: null, notModified: false }
      return {
        status: 200,
        data: new Map(paths.map(path => [path, rawSkill(path.split('/')[1]!)])),
        unreadable: new Set(),
        rateLimit: null,
        notModified: false,
      }
    })

    await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(sqlite.prepare(`SELECT count(*) FROM skills`).pluck().get()).toBe(SKILL_SLICE_SIZE)
  })

  // collectAssets was handed `dirName`, the bare directory *name*, and used it
  // as a path prefix. A skill at `skills/one/SKILL.md` has dirName `one`, which
  // never prefixes `skills/one/reference.md`, so every nested skill recorded
  // zero references. In production that was 2769 of 2883 nested skills.
  it('collects assets for a nested skill', async () => {
    insertRepo(sqlite, 'old-tree')
    github.getTree.mockResolvedValue({
      status: 200,
      data: {
        sha: 'new-tree',
        tree: [
          { path: 'skills/one/SKILL.md', sha: 'one-new', type: 'blob' },
          { path: 'skills/one/reference.md', sha: 'ref', type: 'blob', size: 12 },
          { path: 'skills/one/run.py', sha: 'py', type: 'blob', size: 34 },
          { path: 'skills/one/LICENSE', sha: 'lic', type: 'blob', size: 5 },
        ],
      },
      rateLimit: null,
      notModified: false,
    })
    github.getBlobsBatch.mockImplementation(serveRequestedBlobs())

    await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    const row = sqlite.prepare(`SELECT references_count, assets FROM skills`).get() as {
      references_count: number
      assets: string
    }
    expect(row.references_count).toBe(2)
    expect(JSON.parse(row.assets).map((a: { path: string }) => a.path)).toEqual(['reference.md', 'run.py'])
  })

  // Same root cause, opposite symptom: a bare name can match an unrelated
  // top-level directory and attribute its files to the skill.
  it('does not borrow assets from an unrelated directory of the same name', async () => {
    insertRepo(sqlite, 'old-tree')
    github.getTree.mockResolvedValue({
      status: 200,
      data: {
        sha: 'new-tree',
        tree: [
          { path: 'skills/one/SKILL.md', sha: 'one-new', type: 'blob' },
          { path: 'one/unrelated.md', sha: 'x', type: 'blob', size: 9 },
        ],
      },
      rateLimit: null,
      notModified: false,
    })
    github.getBlobsBatch.mockImplementation(serveRequestedBlobs())

    await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    const row = sqlite.prepare(`SELECT references_count, assets FROM skills`).get() as {
      references_count: number
      assets: string
    }
    expect(row.references_count).toBe(0)
    expect(JSON.parse(row.assets)).toEqual([])
  })

  it('quarantines skills that disappeared, judged across every slice', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'gone', 'gone-sha')
    const count = SKILL_SLICE_SIZE + 2
    github.getTree.mockResolvedValue(bigTree(count))
    github.getBlobsBatch.mockImplementation(serveRequestedBlobs())

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result.status).toBe('indexed')
    expect(sqlite.prepare(
      `SELECT source_resolved, trust_tier FROM skills WHERE name = 'gone'`,
    ).get()).toEqual({ source_resolved: 0, trust_tier: 'quarantined' })
    // Skills present in a *later* slice must not be mistaken for disappeared.
    expect(sqlite.prepare(
      `SELECT count(*) FROM skills WHERE source_resolved = 1`,
    ).pluck().get()).toBe(count)
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
      rendered_skill_path TEXT, rendered_status TEXT, rendered_raw TEXT, rendered_raw_sha256 TEXT, rendered_frontmatter TEXT,
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
