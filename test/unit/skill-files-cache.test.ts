import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const HOUR = 60 * 60
const CACHE_KEY = 'skills:files:v4:owner/repo/skill:main'

let fixture: SqliteD1
let cache: {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.resetModules()
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
  vi.stubGlobal('setHeader', vi.fn())
  vi.stubGlobal('createWideEvent', () => ({ context: {}, setLevel: vi.fn(), emit: vi.fn(() => null) }))
  vi.stubGlobal('emitOperationalEvent', vi.fn())
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

describe('skill-files cache', () => {
  it('computes a cold miss and stores a freshness envelope', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      files: [
        { path: 'skill/SKILL.md', size: 100 },
        { path: 'skill/assets/cover.png', size: 2048 },
      ],
    }))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default
    const payload = await handler(event())

    expect(payload).toEqual({
      skillPath: null,
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' }],
      total: 1,
    })
    expect(cache.getItem).toHaveBeenCalledWith(CACHE_KEY)
    expect(cache.setItem).toHaveBeenCalledWith(
      CACHE_KEY,
      { storedAt: expect.any(Number), value: payload },
      { ttl: HOUR * 6 + HOUR * 24 },
    )
  })

  it('serves a fresh envelope without an upstream call', async () => {
    const payload = {
      skillPath: 'skill',
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' as const }],
      total: 1,
    }
    cache.getItem.mockResolvedValue({ storedAt: Date.now() - 1000, value: payload })
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).resolves.toEqual(payload)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cache.setItem).not.toHaveBeenCalled()
  })

  it('serves the stale envelope when the upstream tree fails', async () => {
    const stale = {
      skillPath: 'skill',
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' as const }],
      total: 1,
    }
    cache.getItem.mockResolvedValue({ storedAt: Date.now() - (HOUR * 6 + 60) * 1000, value: stale })
    const error = Object.assign(new Error('404 Not Found'), { status: 404, statusCode: 404 })
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(error))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).resolves.toEqual(stale)
  })
})

function event(): H3Event {
  return {
    method: 'GET',
    context: { platform: { db: fixture.db } },
  } as unknown as H3Event
}
