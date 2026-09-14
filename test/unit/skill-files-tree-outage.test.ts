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
  vi.stubGlobal('createWideEvent', () => ({ context: {}, setLevel: vi.fn(), emit: vi.fn(() => null) }))
  vi.stubGlobal('emitOperationalEvent', vi.fn())
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

describe('skill-files tree outage', () => {
  it('returns a retryable error without caching an empty file list', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('tree unavailable')))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })

    expect(cache.setItem).not.toHaveBeenCalled()
    expect(responseHeaders.get('retry-after')).toBe(30)
  })
})

describe('skill-files stale serve', () => {
  it('serves a stale envelope on a failed recompute without retry-after', async () => {
    // retry-after is an instruction to re-poll. It belongs to the 503 that
    // reaches the agent, never to a 200 served from a stale envelope, or a
    // crawler sweep re-polls every 30 seconds against a dead upstream.
    const stale = {
      skillPath: 'skill',
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' }],
      total: 1,
    }
    // Seven hours old: past the 6-hour fresh window, inside the day-long
    // stale window, so the failed recompute falls back to this payload.
    cache.getItem.mockResolvedValue({ storedAt: Date.now() - 7 * 60 * 60 * 1000, value: stale })
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('tree unavailable')))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).resolves.toEqual(stale)
    expect(responseHeaders.has('retry-after')).toBe(false)
  })
})

describe('skill-files source gone', () => {
  it('answers 410 from the registry verdict without an upstream call', async () => {
    fixture.raw.prepare(`UPDATE skills SET source_resolved = 0 WHERE owner = 'owner' AND repo = 'repo' AND name = 'skill'`).run()
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 410 })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(cache.setItem).not.toHaveBeenCalled()
  })

  it('classifies an upstream 404 tree as gone rather than an outage', async () => {
    // ungh answers 404 for a deleted repository. ofetch carries the status on
    // the rejection. A 503 with retry-after tells an agent to retry a
    // permanent condition, which is what raised SKILLD-11.
    const error = Object.assign(new Error('404 Not Found'), { status: 404, statusCode: 404 })
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(error))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 410 })

    expect(responseHeaders.has('retry-after')).toBe(false)
  })
})

function event(): H3Event {
  return {
    method: 'GET',
    context: { platform: { db: fixture.db } },
  } as unknown as H3Event
}
