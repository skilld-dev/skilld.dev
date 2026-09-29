import type { AutoIndexDependencies } from '../../layers/registry/server/utils/auto-index-repository'
import type { RepoMeta, TreeResponse } from '../../layers/registry/server/utils/github-client'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_INDEX_CLIENT_LIMIT,
  AUTO_INDEX_GLOBAL_LIMIT,
  autoIndexMissingRepository,
  countSkillFiles,
  decideRepositoryEligibility,
} from '../../layers/registry/server/utils/auto-index-repository'
import { consumeFixedWindow, decideFixedWindow, deleteExpiredFixedWindowBuckets, fixedWindowStart } from '../../layers/registry/server/utils/fixed-window-rate-limit'

function repoMeta(overrides: Partial<RepoMeta> = {}): RepoMeta {
  return {
    name: 'vue-ecosystem-skills',
    full_name: 'skilld-dev/vue-ecosystem-skills',
    html_url: 'https://github.com/skilld-dev/vue-ecosystem-skills',
    owner: { login: 'skilld-dev' },
    default_branch: 'main',
    description: null,
    stargazers_count: 3,
    forks_count: 0,
    pushed_at: '2026-09-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    fork: false,
    private: false,
    ...overrides,
  }
}

function tree(paths: string[]): TreeResponse {
  return {
    sha: 'tree-sha',
    tree: paths.map(path => ({ path, type: 'blob' as const, sha: `blob-${path}` })),
  }
}

describe('auto-indexing a repository the registry does not know', () => {
  let sqlite: Database.Database
  let db: D1Database
  let enqueue: ReturnType<typeof vi.fn>
  let getRepo: ReturnType<typeof vi.fn>
  let getTree: ReturnType<typeof vi.fn>

  function makeDeps(overrides: Partial<AutoIndexDependencies> = {}): AutoIndexDependencies {
    return {
      db,
      env: {} as Cloudflare.Env & Record<string, unknown>,
      clientBucket: 'client-one',
      now: 1_000_000,
      getRepo: getRepo as AutoIndexDependencies['getRepo'],
      getTree: getTree as AutoIndexDependencies['getTree'],
      resolveGithubBindings: () => ({}),
      enqueue: enqueue as unknown as AutoIndexDependencies['enqueue'],
      consumeRateLimit: consumeFixedWindow,
      ...overrides,
    }
  }

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (owner TEXT NOT NULL, repo TEXT NOT NULL, PRIMARY KEY (owner, repo));
      CREATE TABLE discovery_candidates (owner TEXT NOT NULL, repo TEXT NOT NULL, PRIMARY KEY (owner, repo));
      CREATE TABLE skills (owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL, sync_status TEXT);
      CREATE TABLE auto_index_rate_limits (
        bucket TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0)
      );
    `)
    db = wrapSqlite(sqlite)
    enqueue = vi.fn(async () => ({ jobId: 'job-1', status: 'queued' as const }))
    getRepo = vi.fn(async () => ({ status: 200, data: repoMeta(), rateLimit: null }))
    getTree = vi.fn(async () => ({
      status: 200,
      data: tree(['skills/a/SKILL.md', 'skills/b/SKILL.md', 'README.md']),
      rateLimit: null,
    }))
  })

  afterEach(() => sqlite.close())

  it('queues one submission for a public repository that carries SKILL.md files', async () => {
    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'skilld-dev',
      repo: 'vue-ecosystem-skills',
    })

    expect(outcome).toEqual({
      _tag: 'queued',
      owner: 'skilld-dev',
      repo: 'vue-ecosystem-skills',
      jobId: 'job-1',
    })
    expect(enqueue).toHaveBeenCalledWith({}, {
      operation: 'submit',
      owner: 'skilld-dev',
      repo: 'vue-ecosystem-skills',
    })
  })

  it('leaves a repository the registry already holds alone without calling GitHub', async () => {
    sqlite.prepare(`INSERT INTO repos (owner, repo) VALUES (?, ?)`).run('skilld-dev', 'vue-ecosystem-skills')

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'skilld-dev',
      repo: 'vue-ecosystem-skills',
    })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason: 'already_indexed' })
    expect(getRepo).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM auto_index_rate_limits`).get()).toEqual({ n: 0 })
  })

  // harlan-zw/nuxt-ai-ready held only test fixtures, so sync retired every row.
  // When its real Skill lands, a page view must be enough to pick it up.
  it('re-checks a known repository whose every Skill row is retired', async () => {
    sqlite.exec(`
      INSERT INTO repos (owner, repo) VALUES ('harlan-zw', 'nuxt-ai-ready');
      INSERT INTO discovery_candidates (owner, repo) VALUES ('harlan-zw', 'nuxt-ai-ready');
      INSERT INTO skills VALUES
        ('harlan-zw', 'nuxt-ai-ready', 'seo-audit', 'path_missing'),
        ('harlan-zw', 'nuxt-ai-ready', 'site-review', 'path_missing');
    `)
    getRepo = vi.fn(async () => ({
      status: 200,
      data: repoMeta({ name: 'nuxt-ai-ready', full_name: 'harlan-zw/nuxt-ai-ready', owner: { login: 'harlan-zw' } }),
      rateLimit: null,
    }))

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'harlan-zw',
      repo: 'nuxt-ai-ready',
    })

    expect(outcome).toMatchObject({ _tag: 'queued', owner: 'harlan-zw', repo: 'nuxt-ai-ready' })
    expect(enqueue).toHaveBeenCalledWith({}, {
      operation: 'submit',
      owner: 'harlan-zw',
      repo: 'nuxt-ai-ready',
    })
  })

  it('leaves a repository with one live Skill row alone', async () => {
    sqlite.exec(`
      INSERT INTO repos (owner, repo) VALUES ('skilld-dev', 'vue-ecosystem-skills');
      INSERT INTO skills VALUES
        ('skilld-dev', 'vue-ecosystem-skills', 'gone', 'path_missing'),
        ('skilld-dev', 'vue-ecosystem-skills', 'live', 'ok');
    `)

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'skilld-dev',
      repo: 'vue-ecosystem-skills',
    })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason: 'already_indexed' })
    expect(getRepo).not.toHaveBeenCalled()
  })

  it('leaves a repository the discovery ledger already tracks alone', async () => {
    sqlite.prepare(`INSERT INTO discovery_candidates (owner, repo) VALUES (?, ?)`)
      .run('skilld-dev', 'vue-ecosystem-skills')

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'skilld-dev',
      repo: 'vue-ecosystem-skills',
    })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason: 'already_candidate' })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('matches a stored repository whatever case the request used', async () => {
    sqlite.prepare(`INSERT INTO repos (owner, repo) VALUES (?, ?)`).run('skilld-dev', 'vue-ecosystem-skills')

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'Skilld-Dev',
      repo: 'Vue-Ecosystem-Skills',
    })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason: 'already_indexed' })
  })

  it('reports a submission the queue already holds as skipped, not queued', async () => {
    enqueue = vi.fn(async () => ({ jobId: 'job-existing', status: 'duplicate' as const }))

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'skilld-dev',
      repo: 'vue-ecosystem-skills',
    })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason: 'already_queued' })
  })

  it.each([
    ['a fork', repoMeta({ fork: true }), 'repository_is_fork'],
    ['a private repository', repoMeta({ private: true }), 'repository_private'],
  ])('never queues %s', async (_label, meta, reason) => {
    getRepo = vi.fn(async () => ({ status: 200, data: meta, rateLimit: null }))

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'skilld-dev',
      repo: 'vue-ecosystem-skills',
    })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('never queues a repository without a SKILL.md', async () => {
    getTree = vi.fn(async () => ({ status: 200, data: tree(['README.md']), rateLimit: null }))

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'skilld-dev',
      repo: 'no-skills',
    })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason: 'no_skill_files' })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('enqueues the lower-cased identity GitHub answers with, so the queue writes rows the registry reads', async () => {
    getRepo = vi.fn(async () => ({
      status: 200,
      data: repoMeta({
        name: 'TypeScript',
        full_name: 'Microsoft/TypeScript',
        owner: { login: 'Microsoft' },
      }),
      rateLimit: null,
    }))

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'microsoft',
      repo: 'typescript',
    })

    expect(outcome).toMatchObject({ _tag: 'queued', owner: 'microsoft', repo: 'typescript' })
    expect(enqueue).toHaveBeenCalledWith({}, {
      operation: 'submit',
      owner: 'microsoft',
      repo: 'typescript',
    })

    sqlite.prepare(`INSERT INTO repos (owner, repo) VALUES (?, ?)`).run('microsoft', 'typescript')
    const second = await autoIndexMissingRepository(makeDeps(), {
      owner: 'microsoft',
      repo: 'typescript',
    })
    expect(second).toMatchObject({ _tag: 'skipped', reason: 'already_indexed' })
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('never queues from a tree listing GitHub truncated', async () => {
    getTree = vi.fn(async () => ({
      status: 200,
      data: { sha: 'tree-sha', tree: [], truncated: true },
      rateLimit: null,
    }))

    const outcome = await autoIndexMissingRepository(makeDeps(), {
      owner: 'skilld-dev',
      repo: 'huge',
    })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason: 'tree_unavailable' })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('never queues when GitHub does not answer for the repository', async () => {
    getRepo = vi.fn(async () => ({ status: 404, data: null, rateLimit: null }))

    const outcome = await autoIndexMissingRepository(makeDeps(), { owner: 'ghost', repo: 'gone' })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason: 'repository_unavailable' })
    expect(getTree).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('stops one client after its window budget and still serves another client', async () => {
    const attempt = (clientBucket: string, index: number) => autoIndexMissingRepository(
      makeDeps({ clientBucket }),
      { owner: 'owner', repo: `repo-${index}` },
    )

    const crawler = []
    for (let index = 0; index < AUTO_INDEX_CLIENT_LIMIT + 2; index++)
      crawler.push(await attempt('crawler', index))

    expect(crawler.filter(outcome => outcome._tag === 'queued')).toHaveLength(AUTO_INDEX_CLIENT_LIMIT)
    expect(crawler.at(-1)).toMatchObject({ _tag: 'skipped', reason: 'client_rate_limited' })
    expect(await attempt('reader', 99)).toMatchObject({ _tag: 'queued' })
  })

  it('stops every client once the site-wide window budget is spent', async () => {
    sqlite.prepare(
      `INSERT INTO auto_index_rate_limits (bucket, window_start, hits) VALUES ('global', 999000, ?)`,
    ).run(AUTO_INDEX_GLOBAL_LIMIT)

    const outcome = await autoIndexMissingRepository(makeDeps(), { owner: 'owner', repo: 'repo' })

    expect(outcome).toMatchObject({ _tag: 'skipped', reason: 'global_rate_limited' })
    expect(getRepo).not.toHaveBeenCalled()
  })
})

describe('auto-index guards as pure decisions', () => {
  it('admits only a public, non-fork repository that already carries a Skill', () => {
    expect(decideRepositoryEligibility({ fork: false, private: false, skillFileCount: 1 }))
      .toEqual({ _tag: 'eligible' })
    expect(decideRepositoryEligibility({ fork: true, private: false, skillFileCount: 9 }))
      .toEqual({ _tag: 'rejected', reason: 'repository_is_fork' })
    expect(decideRepositoryEligibility({ fork: false, private: true, skillFileCount: 9 }))
      .toEqual({ _tag: 'rejected', reason: 'repository_private' })
    expect(decideRepositoryEligibility({ fork: false, private: false, skillFileCount: 0 }))
      .toEqual({ _tag: 'rejected', reason: 'no_skill_files' })
  })

  it('counts only files named SKILL.md, at any depth', () => {
    expect(countSkillFiles({
      sha: 'x',
      tree: [
        { path: 'SKILL.md', type: 'blob', sha: 'a' },
        { path: 'skills/one/SKILL.md', type: 'blob', sha: 'b' },
        { path: 'docs/SKILL.md.bak', type: 'blob', sha: 'c' },
        { path: 'skills', type: 'tree', sha: 'd' },
      ],
    })).toBe(2)
  })
})

describe('fixed window rate limit', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE auto_index_rate_limits (
        bucket TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0)
      );
    `)
    db = wrapSqlite(sqlite)
  })

  afterEach(() => sqlite.close())

  it('counts each call and refuses the one past the limit', () => {
    expect(decideFixedWindow(2, 2)).toEqual({ _tag: 'allowed', hits: 2 })
    expect(decideFixedWindow(3, 2)).toEqual({ _tag: 'limited', hits: 3 })
  })

  it('releases the budget when the next window starts', async () => {
    const request = { bucket: 'client:one', limit: 2, windowSeconds: 3600 }
    expect(await consumeFixedWindow(db, { ...request, now: 1000 })).toEqual({ _tag: 'allowed', hits: 1 })
    expect(await consumeFixedWindow(db, { ...request, now: 1100 })).toEqual({ _tag: 'allowed', hits: 2 })
    expect(await consumeFixedWindow(db, { ...request, now: 1200 })).toEqual({ _tag: 'limited', hits: 3 })
    expect(await consumeFixedWindow(db, { ...request, now: 7200 })).toEqual({ _tag: 'allowed', hits: 1 })
  })

  it('deletes buckets whose window ended more than one window ago and keeps live ones', async () => {
    const windowSeconds = 3600
    const now = 100_000 * windowSeconds
    sqlite.prepare(
      `INSERT INTO auto_index_rate_limits (bucket, window_start, hits) VALUES (?, ?, ?)`,
    ).run('client:stale', now - 2 * windowSeconds, 5)
    sqlite.prepare(
      `INSERT INTO auto_index_rate_limits (bucket, window_start, hits) VALUES (?, ?, ?)`,
    ).run('client:current', fixedWindowStart(now, windowSeconds), 3)

    const deleted = await deleteExpiredFixedWindowBuckets(db, { windowSeconds, now })

    expect(deleted).toBe(1)
    const buckets = sqlite.prepare(`SELECT bucket FROM auto_index_rate_limits`).all().map((row: unknown) => (row as { bucket: string }).bucket)
    expect(buckets).toEqual(['client:current'])
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
