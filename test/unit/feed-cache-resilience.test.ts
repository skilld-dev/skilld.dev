// @vitest-environment node
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  all: vi.fn(),
  board: vi.fn(),
}))
vi.mock('#server/utils/db', () => ({
  getDB: () => ({ prepare: () => ({ bind: () => ({ all: boundary.all }) }) }),
}))
vi.mock('#shared/server/trending-board', () => ({ loadTrendingBoard: boundary.board }))
vi.mock('#shared/server/star-series', () => ({ loadStarSeries: async () => new Map(), starSeriesKey: () => '' }))

let storage: Map<string, unknown>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
  vi.resetModules()
  boundary.all.mockReset().mockResolvedValue({ results: [] })
  boundary.board.mockReset().mockResolvedValue({ entries: [], namedSkills: [], fallback: [] })
  storage = new Map()
  vi.stubGlobal('setHeader', vi.fn())
  vi.stubGlobal('emitOperationalEvent', vi.fn())
  vi.stubGlobal('createWideEvent', () => ({}))
  vi.stubGlobal('useStorage', () => ({
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: unknown) => { storage.set(key, value) },
  }))
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  // Exercise the recompute behind Nitro's fresh cache. Nitro cannot supply a
  // stale result with swr:false, so each expired request reaches this handler.
  vi.stubGlobal('defineCachedEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getQuery', (event: H3Event) => Object.fromEntries(new URLSearchParams((event.node.req.url ?? '').split('?')[1])))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function request(route: string, query = '', deployment = 'release-a'): H3Event {
  return {
    path: `/api/feed/${route}${query}`,
    node: { req: { headers: { host: 'skilld.dev' }, url: `/api/feed/${route}${query}` } },
    context: { platform: { env: { CF_VERSION_METADATA: { id: deployment } } } },
  } as unknown as H3Event
}

const routes = [
  { route: 'recent-updates', load: () => import('../../server/api/feed/recent-updates.get') },
  { route: 'recent-publishes', load: () => import('../../server/api/feed/recent-publishes.get') },
  { route: 'trending', load: () => import('../../server/api/feed/trending.get') },
]

describe.each(routes)('$route feed cache', ({ route, load }) => {
  it('serves its last good response when an expired entry cannot refresh', async () => {
    const handler = (await load()).default
    const fresh = await handler(request(route))
    expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'max-age=300')
    boundary.all.mockRejectedValue(new Error('D1 DB is overloaded'))
    boundary.board.mockRejectedValue(new Error('D1 DB is overloaded'))

    await expect(handler(request(route))).resolves.toEqual(fresh)
    vi.advanceTimersByTime(301_000)
    await expect(handler(request(route))).resolves.toEqual(fresh)
    vi.advanceTimersByTime(3600_000)
    await expect(handler(request(route))).rejects.toThrow('D1 DB is overloaded')
  })

  it('propagates failures on a cold key and after the stale window', async () => {
    const handler = (await load()).default
    await handler(request(route))
    boundary.all.mockRejectedValue(new Error('D1 DB is overloaded'))
    boundary.board.mockRejectedValue(new Error('D1 DB is overloaded'))

    vi.advanceTimersByTime(301_000)
    if (route === 'trending')
      await expect(handler(request(route, '?window=24'))).rejects.toThrow('D1 DB is overloaded')
    else
      await expect(handler(request(route, '?ignored=24'))).resolves.toEqual({ items: [] })
    await expect(handler(request(route, '', 'release-b'))).rejects.toThrow('D1 DB is overloaded')
    vi.advanceTimersByTime(3600_000)
    await expect(handler(request(route))).rejects.toThrow('D1 DB is overloaded')
  })
})

it('shares equivalent trending options without sharing a different window', async () => {
  const handler = (await import('../../server/api/feed/trending.get')).default
  const fresh = await handler(request('trending', '?limit=500&window=900'))
  boundary.board.mockRejectedValue(new Error('D1 DB is overloaded'))
  await expect(handler(request('trending', '?window=720&limit=50&ignored=x'))).resolves.toEqual(fresh)
  await expect(handler(request('trending', '?window=24&limit=50'))).rejects.toThrow('D1 DB is overloaded')
})
