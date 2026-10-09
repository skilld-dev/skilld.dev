import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prefetchUnchangedRepos } from '../../layers/registry/server/utils/sync-prefetch'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_791_300_000
const bindings = { GITHUB_TOKEN: 'test-token' }

/** The head tree GitHub reports for each repository. */
const heads: Record<string, string> = {
  'acme/unchanged': 'tree-same',
  'acme/changed': 'tree-new',
  'acme/fresh': 'tree-fresh',
  'acme/busy': 'tree-busy',
  'acme/discovered': 'tree-discovered',
  'acme/renamed': 'tree-same',
}

function graphqlAnswer(_input: unknown, init?: RequestInit): Response {
  const body = JSON.parse(String(init?.body)) as { variables: Record<string, string> }
  const data: Record<string, unknown> = {}
  const errors: unknown[] = []
  for (const key of Object.keys(body.variables).filter(name => name.startsWith('o'))) {
    const index = key.slice(1)
    const fullName = `${body.variables[key]}/${body.variables[`n${index}`]}`
    const tree = heads[fullName]
    if (!tree) {
      data[`r${index}`] = null
      errors.push({ type: 'NOT_FOUND', path: [`r${index}`] })
      continue
    }
    const [owner, name] = fullName.split('/') as [string, string]
    data[`r${index}`] = {
      databaseId: 4242,
      name,
      nameWithOwner: fullName,
      url: `https://github.com/${fullName}`,
      owner: { login: owner },
      description: 'Skills',
      stargazerCount: 77,
      forkCount: 2,
      pushedAt: '2026-10-01T00:00:00Z',
      createdAt: '2025-01-01T00:00:00Z',
      isArchived: false,
      isFork: false,
      isPrivate: false,
      defaultBranchRef: { name: 'main', target: { oid: 'c'.repeat(40), tree: { oid: tree } } },
    }
  }
  return new Response(JSON.stringify({ data, errors: errors.length ? errors : undefined }), { status: 200 })
}

function candidate(repo: string, claimDiscovery = false, owner = 'acme') {
  return { owner, repo, ownerVerified: false, claimDiscovery }
}

describe('prefetchUnchangedRepos', () => {
  let harness: SqliteD1

  beforeEach(() => {
    harness = createSqliteD1(allMigrations())
    for (const [repo, tree] of [['unchanged', 'tree-same'], ['changed', 'tree-old'], ['fresh', null], ['busy', 'tree-busy'], ['discovered', 'tree-discovered']] as const) {
      harness.raw.prepare(`INSERT INTO repos (owner, repo, last_tree_sha, pushed_at, stars) VALUES ('acme', ?, ?, 100, 1)`).run(repo, tree)
      if (repo !== 'fresh')
        harness.raw.prepare(`INSERT INTO skills (owner, repo, name, display_name, slug) VALUES ('acme', ?, 'one', 'One', 'one')`).run(repo)
    }
    harness.raw.prepare(`INSERT INTO repo_sync_progress (owner, repo, job_id, tree_sha, checked_at, next_offset, updated_at) VALUES ('acme', 'busy', 'job-1', 'tree-busy', ?, 250, ?)`).run(NOW - 60, NOW - 60)
  })

  afterEach(() => {
    harness.close()
    vi.unstubAllGlobals()
  })

  it('records an unchanged repository in place and queues only the ones that need a job', async () => {
    const fetchMock = vi.fn(graphqlAnswer)
    vi.stubGlobal('fetch', fetchMock)

    const result = await prefetchUnchangedRepos({ db: harness.db, bindings, now: NOW }, [
      candidate('unchanged'),
      candidate('changed'),
      candidate('fresh'),
      candidate('busy'),
      candidate('discovered', true),
      candidate('missing', false, 'gone'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.queue.map(item => `${item.owner}/${item.repo}`)).toEqual([
      'acme/changed',
      'acme/fresh',
      'acme/busy',
      'acme/discovered',
      'gone/missing',
    ])
    expect(result).toMatchObject({ _tag: 'prefetched', unchanged: 1 })
    expect(harness.raw.prepare(`SELECT stars, repo_meta_synced_at FROM repos WHERE owner = 'acme' AND repo = 'unchanged'`).get())
      .toEqual({ stars: 77, repo_meta_synced_at: NOW })
    expect(harness.raw.prepare(`SELECT repo_meta_synced_at FROM repos WHERE owner = 'acme' AND repo = 'changed'`).get())
      .toEqual({ repo_meta_synced_at: null })
  })

  it('queues a Repository GitHub moved, so its sync job can move the rows', async () => {
    harness.raw.exec(`
      INSERT INTO repos (owner, repo, last_tree_sha, pushed_at, stars, source_owner, source_repo)
      VALUES ('acme', 'old-name', 'tree-same', 100, 1, 'acme', 'renamed');
      INSERT INTO skills (owner, repo, name, display_name, slug) VALUES ('acme', 'old-name', 'one', 'One', 'one');
    `)
    vi.stubGlobal('fetch', vi.fn(graphqlAnswer))

    const result = await prefetchUnchangedRepos({ db: harness.db, bindings, now: NOW }, [candidate('old-name')])

    expect(result).toMatchObject({ _tag: 'prefetched', unchanged: 0 })
    expect(result.queue.map(item => `${item.owner}/${item.repo}`)).toEqual(['acme/old-name'])
    expect(harness.raw.prepare(`SELECT repo_meta_synced_at FROM repos WHERE owner = 'acme' AND repo = 'old-name'`).get())
      .toEqual({ repo_meta_synced_at: null })
  })

  it('queues a changed tree even when the push timestamp has not advanced', async () => {
    harness.raw.prepare(`UPDATE repos SET pushed_at = ? WHERE owner = 'acme' AND repo = 'changed'`)
      .run(Date.parse('2026-10-01T00:00:00Z') / 1000)
    vi.stubGlobal('fetch', vi.fn(graphqlAnswer))

    const result = await prefetchUnchangedRepos({ db: harness.db, bindings, now: NOW }, [candidate('changed')])

    expect(result.queue).toEqual([candidate('changed')])
    expect(harness.raw.prepare(`SELECT repo_meta_synced_at FROM repos WHERE owner = 'acme' AND repo = 'changed'`).get())
      .toEqual({ repo_meta_synced_at: null })
  })

  it('queues every candidate when GitHub does not answer the batch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad gateway', { status: 502 })))

    const result = await prefetchUnchangedRepos({ db: harness.db, bindings, now: NOW }, [
      candidate('unchanged'),
      candidate('changed'),
    ])

    expect(result).toMatchObject({ _tag: 'unread', reason: 'graphql-502' })
    expect(result.queue).toHaveLength(2)
    expect(harness.raw.prepare(`SELECT repo_meta_synced_at FROM repos WHERE owner = 'acme' AND repo = 'unchanged'`).get())
      .toEqual({ repo_meta_synced_at: null })
  })
})
