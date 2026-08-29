import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

let fixture: SqliteD1
let cache: {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
}
const responseHeaders = new Map<string, string | number>()

beforeEach(() => {
  vi.resetModules()
  responseHeaders.clear()
  fixture = createSqliteD1(allMigrations())
  fixture.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('owner', 'repo')`).run()
  fixture.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved)
     VALUES ('owner', 'repo', 'skill', 'owner/repo/skill', 'Skill', 1)`,
  ).run()
  cache = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  }

  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getRouterParam', () => 'owner/repo/skill')
  vi.stubGlobal('getUserSession', () => Promise.resolve({ user: { id: 1, login: 'tester' } }))
  vi.stubGlobal('useStorage', () => cache)
  vi.stubGlobal('setHeader', (_event: H3Event, name: string, value: string | number) => {
    responseHeaders.set(name, value)
  })
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

describe('skills-raw tree outage', () => {
  it('returns a retryable error without caching the Skill as missing', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('tree unavailable')))

    const handler = (await import('../../layers/registry/server/api/skills-raw/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })

    expect(cache.setItem).not.toHaveBeenCalled()
    expect(responseHeaders.get('retry-after')).toBe(30)
  })
})

describe('skills-raw default branch', () => {
  it('serves a skill whose repository default branch is not main, without a repo metadata round trip', async () => {
    fixture.raw.prepare(`UPDATE repos SET default_branch = 'master' WHERE owner = 'owner' AND repo = 'repo'`).run()
    // ungh's real wire shape: defaultBranch lives under .repo, and a tree
    // listing only exists for the repository's actual default branch.
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/files/master'))
        return Promise.resolve({ files: [{ path: 'skills/skill/SKILL.md' }] })
      if (url.endsWith('/files/main'))
        return Promise.reject(new Error('404 Not Found'))
      return Promise.resolve({ repo: { defaultBranch: 'master' } })
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('# Skill body', { status: 200 }),
    ))

    const handler = (await import('../../layers/registry/server/api/skills-raw/[...slug].get')).default
    const body = await handler(event())

    expect(body).toBe('# Skill body')
    expect(responseHeaders.get('x-skilld-source')).toBe('owner/repo@master/skills/skill/SKILL.md')
    const treeUrls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(treeUrls).toEqual(['https://ungh.cc/repos/owner/repo/files/master'])
    expect(treeUrls.some(url => url.endsWith('/files/main'))).toBe(false)
  })
})

function event(): H3Event {
  return {
    method: 'GET',
    context: { platform: { db: fixture.db } },
  } as unknown as H3Event
}
