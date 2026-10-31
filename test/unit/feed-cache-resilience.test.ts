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
  // `staleMs` is one second past the feed's fresh window; `deadMs` is one
  // second past fresh + stale. Trending rides a 30-minute window (X posts
  // land every 15 minutes at most), the others the 300 s default.
  { route: 'recent-updates', load: () => import('../../server/api/feed/recent-updates.get'), staleMs: 301_000, deadMs: 3_901_000 },
  { route: 'recent-publishes', load: () => import('../../server/api/feed/recent-publishes.get'), staleMs: 301_000, deadMs: 3_901_000 },
  { route: 'trending', load: () => import('../../server/api/feed/trending.get'), staleMs: 1_801_000, deadMs: 5_401_000 },
]

describe.each(routes)('$route feed cache', ({ route, load, staleMs, deadMs }) => {
  it('serves its last good response when an expired entry cannot refresh', async () => {
    const handler = (await load()).default
    const fresh = await handler(request(route))
    expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'max-age=300')
    boundary.all.mockRejectedValue(new Error('D1 DB is overloaded'))
    boundary.board.mockRejectedValue(new Error('D1 DB is overloaded'))

    await expect(handler(request(route))).resolves.toEqual(fresh)
    vi.advanceTimersByTime(staleMs)
    await expect(handler(request(route))).resolves.toEqual(fresh)
    vi.advanceTimersByTime(deadMs - staleMs)
    await expect(handler(request(route))).rejects.toThrow('D1 DB is overloaded')
  })

  it('propagates failures on a cold key and after the stale window', async () => {
    const handler = (await load()).default
    await handler(request(route))
    boundary.all.mockRejectedValue(new Error('D1 DB is overloaded'))
    boundary.board.mockRejectedValue(new Error('D1 DB is overloaded'))

    vi.advanceTimersByTime(staleMs)
    if (route === 'trending')
      await expect(handler(request(route, '?window=24'))).rejects.toThrow('D1 DB is overloaded')
    else
      await expect(handler(request(route, '?ignored=24'))).resolves.toEqual({ items: [] })
    await expect(handler(request(route, '', 'release-b'))).rejects.toThrow('D1 DB is overloaded')
    vi.advanceTimersByTime(deadMs - staleMs)
    await expect(handler(request(route))).rejects.toThrow('D1 DB is overloaded')
  })
})

it('trending serves one compute across a 15-minute ingest cadence', async () => {
  // X posts land every 15 minutes (`sync-x-mentions` runs `*/15 * * * *`), so
  // the board's inputs cannot change inside this gap. A second compute there
  // only repeats the full post-window scan.
  const handler = (await import('../../server/api/feed/trending.get')).default
  const first = await handler(request('trending'))
  vi.advanceTimersByTime(900_000)
  await expect(handler(request('trending'))).resolves.toEqual(first)
  expect(boundary.board).toHaveBeenCalledTimes(1)
})

it('shares equivalent trending options without sharing a different window', async () => {
  const handler = (await import('../../server/api/feed/trending.get')).default
  const fresh = await handler(request('trending', '?limit=500&window=900'))
  boundary.board.mockRejectedValue(new Error('D1 DB is overloaded'))
  await expect(handler(request('trending', '?window=720&limit=50&ignored=x'))).resolves.toEqual(fresh)
  await expect(handler(request('trending', '?window=24&limit=50'))).rejects.toThrow('D1 DB is overloaded')
})
