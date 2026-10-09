import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRepoSummary } from '../../layers/registry/server/utils/github-client'
import { readRepositoryPurposeEvidence, refreshRepositoryPurpose } from '../../layers/registry/server/utils/repository-purpose-effect'
import { syncRepo } from '../../layers/registry/server/utils/sync-repo'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const COMMIT = 'a'.repeat(40)

function summary(id: number, owner = 'acme', name = 'skills') {
  return Response.json({ data: { repository: {
    databaseId: id,
    isPrivate: false,
    name,
    nameWithOwner: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
    owner: { login: owner },
    description: 'Skills',
    stargazerCount: 1,
    forkCount: 0,
    pushedAt: '2026-10-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    isArchived: false,
    isFork: false,
    defaultBranchRef: { name: 'main', target: { oid: COMMIT, tree: { oid: 'tree' } } },
  } } })
}

function movedRepository(overrides = {}) {
  return { id: 111, private: false, owner: { login: 'new-owner' }, name: 'renamed', ...overrides }
}

describe('repository recovery by stored ID', () => {
  let d1: SqliteD1 | null = null
  afterEach(() => {
    vi.unstubAllGlobals()
    d1?.close()
    d1 = null
  })

  it('classifies the stored Repository after its name disappears without quarantining it', async () => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec(`INSERT INTO repos(owner,repo,repository_id,repo_skill_count) VALUES ('acme','skills',111,1)`)
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(Response.json(movedRepository())).mockResolvedValueOnce(summary(111, 'new-owner', 'renamed')).mockResolvedValueOnce(Response.json({ sha: 'tree', truncated: false, tree: [] }))
    vi.stubGlobal('fetch', fetch)

    const result = await refreshRepositoryPurpose({
      db: d1.db,
      readEvidence: (identity, repositoryId) => readRepositoryPurposeEvidence(identity, {}, repositoryId),
      judge: async () => ({ model: 'jev-1.13.0', answers: { purpose: {
        type: 'choice',
        choice: 'software',
        confidence: 1,
        probabilities: { 'software': 1, 'directory': 0, 'skill-pack': 0, 'mirror': 0, 'uncertain': 0 },
      } } }),
    }, { owner: 'acme', repo: 'skills' }, 1000)

    expect(result).toMatchObject({ _tag: 'classified', sourceCommit: COMMIT })
    expect(d1.raw.prepare('SELECT broken_since FROM repos').get()).toEqual({ broken_since: null })
    expect(d1.raw.prepare('SELECT source_commit FROM repository_purpose').get()).toEqual({ source_commit: COMMIT })
  })

  it.each([404, 200])('moves stored Skills after recovering a name that answers %s', async (status) => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec(`
      INSERT INTO repos (owner,repo,repository_id,last_tree_sha,repo_skill_count)
      VALUES ('acme','skills',111,'tree',1);
      INSERT INTO skills (owner,repo,name,display_name,slug,description,current_sha,source_resolved)
      VALUES ('acme','skills','one','One','acme/one','A Skill','blob',1);
    `)
    const fetch = vi.fn().mockResolvedValueOnce(status === 200 ? summary(222) : new Response(null, { status })).mockResolvedValueOnce(Response.json(movedRepository())).mockResolvedValueOnce(summary(111, 'new-owner', 'renamed'))
    vi.stubGlobal('fetch', fetch)

    const result = await syncRepo('acme', 'skills', {}, d1.db)

    expect(result).toMatchObject({ status: 'skipped-tree-sha', movedTo: { owner: 'new-owner', repo: 'renamed' } })
    expect(d1.raw.prepare('SELECT owner,repo,repository_id FROM repos').all())
      .toEqual([{ owner: 'new-owner', repo: 'renamed', repository_id: 111 }])
    expect(d1.raw.prepare('SELECT owner,repo,name,current_sha FROM skills').all())
      .toEqual([{ owner: 'new-owner', repo: 'renamed', name: 'one', current_sha: 'blob' }])
    expect(d1.raw.prepare('SELECT owner,repo,target_owner,target_repo FROM repo_aliases').all())
      .toEqual([{ owner: 'acme', repo: 'skills', target_owner: 'new-owner', target_repo: 'renamed' }])
  })

  it.each([404, 410, 200])('recovers the stored Repository when the old name answers %s', async (status) => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(status === 200 ? summary(222) : new Response(null, { status }))
      .mockResolvedValueOnce(Response.json(movedRepository()))
      .mockResolvedValueOnce(summary(111, 'new-owner', 'renamed'))
    vi.stubGlobal('fetch', fetch)

    const result = await getRepoSummary('acme', 'skills', {}, 111)

    expect(result).toMatchObject({ status: 200, data: { repositoryId: 111, meta: { full_name: 'new-owner/renamed' } } })
    expect(fetch.mock.calls[1]?.[0]).toBe('https://api.github.com/repositories/111')
    expect(JSON.parse(fetch.mock.calls[2]?.[1].body).variables).toEqual({ owner: 'new-owner', repo: 'renamed' })
  })

  it.each([401, 403, 429, 502])('preserves temporary or credential failure %s without ID lookup', async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }))
    vi.stubGlobal('fetch', fetch)

    expect(await getRepoSummary('acme', 'skills', {}, 111)).toMatchObject({ status, data: null })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, null, 111])('avoids extra reads when the stored ID is %s', async (storedId) => {
    const fetch = vi.fn().mockResolvedValue(summary(111))
    vi.stubGlobal('fetch', fetch)

    expect(await getRepoSummary('acme', 'skills', {}, storedId)).toMatchObject({ status: 200, data: { repositoryId: 111 } })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([404, 503])('preserves an ID lookup failure %s instead of indexing the replacement', async (status) => {
    const fetch = vi.fn().mockResolvedValueOnce(summary(222)).mockResolvedValueOnce(new Response(null, { status }))
    vi.stubGlobal('fetch', fetch)

    expect(await getRepoSummary('acme', 'skills', {}, 111)).toMatchObject({ status, data: null })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    { value: movedRepository({ private: true }), status: 404 },
    { value: movedRepository({ private: undefined }), status: 502 },
    { value: movedRepository({ id: 222 }), status: 502 },
    { value: movedRepository({ owner: null }), status: 502 },
  ])('refuses an unsafe ID lookup answer with status $status', async ({ value, status }) => {
    const fetch = vi.fn().mockResolvedValueOnce(summary(222)).mockResolvedValueOnce(Response.json(value))
    vi.stubGlobal('fetch', fetch)

    expect(await getRepoSummary('acme', 'skills', {}, 111)).toMatchObject({ status, data: null })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fails closed when the recovered name is reused before its summary read', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(summary(222)).mockResolvedValueOnce(Response.json(movedRepository())).mockResolvedValueOnce(summary(333, 'new-owner', 'renamed'))
    vi.stubGlobal('fetch', fetch)

    expect(await getRepoSummary('acme', 'skills', {}, 111)).toMatchObject({ status: 502, data: null })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
