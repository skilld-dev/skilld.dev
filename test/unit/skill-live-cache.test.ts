import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface CacheEntry {
  value?: unknown
  mtime?: number
}

interface CapturedCacheOptions {
  maxAge: number
  swr?: boolean
}

let clockSec = 0
let upstreamFetches = 0
let cacheWrites = 0

/**
 * Serving model of nitropack 2.13.4's cached handler
 * (dist/runtime/internal/cache.mjs): an entry older than maxAge is expired;
 * with `swr` the stale entry is served while one background refresh runs,
 * and every completed resolve writes the entry back to KV.
 */
function cacheModel(handler: (event: H3Event) => Promise<unknown>, options: CapturedCacheOptions) {
  let entry: CacheEntry = {}
  const resolve = async (event: H3Event) => {
    const value = await handler(event)
    entry = { value, mtime: clockSec * 1000 }
    cacheWrites++
    return value
  }
  return async (event: H3Event) => {
    const expired = entry.value === undefined || clockSec * 1000 - (entry.mtime ?? 0) > options.maxAge * 1000
    if (!expired)
      return entry.value
    if (options.swr && entry.value !== undefined) {
      await resolve(event)
      return entry.value
    }
    return await resolve(event)
  }
}

vi.stubGlobal('defineCachedEventHandler', cacheModel)
vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'id' ? 'acme/skills/deploy' : undefined))
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
vi.stubGlobal('emitOperationalEvent', () => {})
vi.stubGlobal('createWideEvent', (fields: unknown) => fields)
vi.stubGlobal('$fetch', async () => {
  upstreamFetches++
  return { id: 'acme/skills/deploy', audits: [] }
})

let handler: (event: H3Event) => Promise<unknown>

beforeEach(async () => {
  vi.resetModules()
  clockSec = 1_800_000_000
  upstreamFetches = 0
  cacheWrites = 0
  handler = (await import('../../layers/registry/server/api/skill-live/[...id].get')).default as (event: H3Event) => Promise<unknown>
})

// Every skill page render calls this route during SSR. Crawlers revisit the
// same skills several times a day, so an hourly refresh rewrote the KV entry
// and refetched skills.sh on most renders: about 1 in 7 skilld-cache writes
// (7.8k/day measured 2026-09-14). Audits change on skills.sh's schedule, not
// ours, so one refresh a day is enough.
describe('skill live audit cache', () => {
  it('serves renders within a day from one upstream fetch and one KV write', async () => {
    const start = clockSec
    await handler(event())
    for (const hoursLater of [2, 6, 12, 23]) {
      clockSec = start + hoursLater * 3600
      await handler(event())
    }

    expect(upstreamFetches).toBe(1)
    expect(cacheWrites).toBe(1)
  })

  it('refreshes the audits once the day has passed', async () => {
    await handler(event())
    clockSec += 25 * 3600
    await handler(event())

    expect(upstreamFetches).toBe(2)
    expect(cacheWrites).toBe(2)
  })
})

function event(): H3Event {
  return { context: {}, node: { req: { headers: {} } } } as unknown as H3Event
}
