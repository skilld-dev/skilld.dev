import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'
import { SIGNED_IN_HEADERS } from './helpers/session'

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
  vi.stubGlobal('getRouterParam', () => 'owner/repo/skill/references/guide.md')
  vi.stubGlobal('getUserSession', () => Promise.resolve({ user: { id: 1, login: 'tester' } }))
  vi.stubGlobal('useStorage', () => cache)
  vi.stubGlobal('setHeader', (_event: H3Event, name: string, value: string | number) => {
    responseHeaders.set(name, value)
  })
  vi.stubGlobal('createWideEvent', () => ({ context: {}, setLevel: vi.fn(), emit: vi.fn(() => null) }))
  vi.stubGlobal('emitOperationalEvent', vi.fn())
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

describe('skill-asset tree outage', () => {
  it('returns a retryable error without caching the asset as missing', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('tree unavailable')))

    const handler = (await import('../../layers/registry/server/api/skill-asset/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })

    expect(cache.setItem).not.toHaveBeenCalled()
    expect(responseHeaders.get('retry-after')).toBe(30)
  })
})

describe('skill-asset source gone', () => {
  it('answers 410 from the registry verdict without an upstream call', async () => {
    fixture.raw.prepare(`UPDATE skills SET source_resolved = 0 WHERE owner = 'owner' AND repo = 'repo' AND name = 'skill'`).run()
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const handler = (await import('../../layers/registry/server/api/skill-asset/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 410 })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(cache.setItem).not.toHaveBeenCalled()
  })

  it('classifies an upstream 404 tree as gone rather than an outage', async () => {
    // ungh answers 404 for a deleted repository. A 503 with retry-after tells
    // an agent to retry a permanent condition, which is what raised SKILLD-11.
    const error = Object.assign(new Error('404 Not Found'), { status: 404, statusCode: 404 })
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(error))

    const handler = (await import('../../layers/registry/server/api/skill-asset/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 410 })

    expect(responseHeaders.has('retry-after')).toBe(false)
  })
})

function event(): H3Event {
  return {
    method: 'GET',
    context: { platform: { db: fixture.db } },
    node: { req: { headers: { ...SIGNED_IN_HEADERS } } },
  } as unknown as H3Event
}
