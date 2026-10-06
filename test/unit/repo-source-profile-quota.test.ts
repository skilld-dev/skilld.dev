import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { createStorage } from 'unstorage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const route = { owner: 'acme', repo: 'skills' }
let edgeCache = createStorage()
let harness: SqliteD1

function stubRuntime(): void {
  vi.stubGlobal('defineCachedEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
  vi.stubGlobal('getRouterParam', (_event: unknown, key: 'owner' | 'repo') => route[key])
  vi.stubGlobal('useStorage', () => edgeCache)
}

const TREE_SHA = 'a'.repeat(40)

function repoMeta(overrides: Record<string, unknown> = {}) {
  return {
    name: 'skills',
    full_name: 'acme/skills',
    html_url: 'https://github.com/acme/skills',
    owner: { login: 'acme' },
    default_branch: 'main',
    description: 'Skills',
    stargazers_count: 12,
    forks_count: 3,
    pushed_at: '2026-10-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    private: false,
    ...overrides,
  }
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init })
}

async function profile(): Promise<Record<string, unknown>> {
  const handler = (await import('../../layers/registry/server/api/repos/[owner]/[repo].get')).default as (event: H3Event) => Promise<Record<string, unknown>>
  return handler({ context: { platform: { db: harness.db, env: { GITHUB_TOKEN: 'token' } } } } as unknown as H3Event)
}

function calls(fetchMock: ReturnType<typeof vi.fn>, fragment: string): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes(fragment)).length
}

beforeEach(() => {
  edgeCache = createStorage()
  harness = createSqliteD1(allMigrations())
  route.repo = 'skills'
  stubRuntime()
})

// The global wide event stubs come from the setup file, so this file never
// calls `vi.unstubAllGlobals()`: each test replaces the stubs it needs.
afterEach(() => {
  harness.close()
})

describe('repository source profile GitHub spend', () => {
  it('answers 404 for a private repository and never lists its tree', async () => {
    const fetchMock = vi.fn(async () => json(repoMeta({ private: true })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(profile()).rejects.toMatchObject({ statusCode: 404 })
    expect(calls(fetchMock, '/git/trees/')).toBe(0)
  })

  it('remembers a repository GitHub cannot find, so a repeat view reads nothing', async () => {
    route.repo = 'gone'
    const fetchMock = vi.fn(async () => json({ message: 'Not Found' }, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(profile()).rejects.toMatchObject({ statusCode: 404 })
    await expect(profile()).rejects.toMatchObject({ statusCode: 404 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads repository metadata from ungh.cc when GitHub refuses with a spent quota', async () => {
    const fetchMock = vi.fn(async (input: unknown) => String(input).startsWith('https://ungh.cc/')
      ? json({ repo: { id: 1, name: 'skills', repo: 'acme/skills', description: 'From ungh', createdAt: '2025-01-01T00:00:00Z', pushedAt: '2026-10-01T00:00:00Z', stars: 99, forks: 4, defaultBranch: 'trunk' } })
      : json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }))
    vi.stubGlobal('fetch', fetchMock)

    const body = await profile()

    expect(body).toMatchObject({ owner: 'acme', repo: 'skills', stars: 99, description: 'From ungh', defaultBranch: 'trunk', skillFileScanStatus: 'unavailable' })
    expect(calls(fetchMock, '/git/trees/')).toBe(0)
  })

  it('lists a registry repository at its synced tree, once per tree', async () => {
    harness.raw.prepare(`INSERT INTO repos (owner, repo, last_tree_sha) VALUES ('acme', 'skills', ?)`).run(TREE_SHA)
    const fetchMock = vi.fn(async (input: unknown) => String(input).includes('/git/trees/')
      ? json({ sha: TREE_SHA, tree: [{ path: 'skills/one/SKILL.md', type: 'blob', sha: 'b'.repeat(40) }] })
      : json(repoMeta()))
    vi.stubGlobal('fetch', fetchMock)

    const first = await profile()
    const second = await profile()

    expect(first).toMatchObject({ skillFileScanStatus: 'ok', skillFiles: ['skills/one/SKILL.md'] })
    expect(second).toMatchObject({ skillFiles: ['skills/one/SKILL.md'] })
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes(`/git/trees/${TREE_SHA}`))).toHaveLength(1)
  })
})
