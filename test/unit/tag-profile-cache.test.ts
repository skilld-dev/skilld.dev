import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

interface CacheEntry {
  value?: unknown
  mtime?: number
}

interface CapturedCacheOptions {
  maxAge: number
  staleMaxAge?: number
  swr?: boolean
  validate?: (entry: CacheEntry) => boolean
}

/**
 * Nitro's cache options captured from the last cached wrapper built.
 */
let cacheOptions: CapturedCacheOptions | undefined
let handlerRuns = 0
let clockSec = 0

/**
 * Serving model of nitropack 2.13.4's `defineCachedFunction`
 * (dist/runtime/internal/cache.mjs), which this route's cache builds on.
 * An entry is expired once maxAge passes or `validate(entry)` returns
 * false. With `swr` on, an expired entry whose validate still passes is
 * served immediately while a refresh runs in the background; a failed
 * refresh leaves the stale entry in place. `staleMaxAge` never gates
 * serving at the origin: nitro only forwards it into the Cache-Control
 * header. The only origin-side stale bound is therefore the handler's own
 * validate callback.
 */
function cacheModel(resolver: (...args: unknown[]) => Promise<unknown>, options: CapturedCacheOptions) {
  cacheOptions = options
  let entry: CacheEntry = {}
  const validate = options.validate ?? ((candidate: CacheEntry) => candidate.value !== undefined)
  const resolve = async (...args: unknown[]) => {
    const value = await resolver(...args)
    entry = { value, mtime: clockSec * 1000 }
    return value
  }
  return async (...args: unknown[]) => {
    const unexpired = entry.value !== undefined
      && clockSec * 1000 - (entry.mtime ?? 0) <= options.maxAge * 1000
      && validate(entry) !== false
    if (unexpired)
      return entry.value
    if (options.swr && entry.value !== undefined && validate(entry) !== false) {
      handlerRuns++
      void resolve(...args).catch(() => {
        // Nitro discards a failed background refresh; the stale entry stays.
      })
      return entry.value
    }
    handlerRuns++
    return await resolve(...args)
  }
}

vi.stubGlobal('defineCachedFunction', cacheModel)

vi.stubGlobal('defineEventHandler', (handler: (event: H3Event) => Promise<unknown>) => handler)
vi.stubGlobal('setResponseHeader', () => {})

vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'slug' ? 'frontend' : undefined))
vi.stubGlobal('getQuery', () => ({}))
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))

let harness: SqliteD1
let handler: (event: H3Event) => Promise<{ skills: unknown[] }>

beforeEach(async () => {
  vi.resetModules()
  cacheOptions = undefined
  handlerRuns = 0
  // Fake Date (timers stay real) and seed it from the real clock: the
  // route's validate reads Date.now(), so entry ages must move through the
  // same clock the serving model uses.
  const realNowSec = Math.floor(Date.now() / 1000)
  vi.useFakeTimers({ toFake: ['Date'] })
  clockSec = realNowSec
  vi.setSystemTime(clockSec * 1000)
  harness = createSqliteD1(allMigrations())
  harness.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('acme', 'tools')`).run()
  seedSkill('frontend-lint')
  handler = (await import('../../layers/registry/server/api/tags/[slug].get')).default as (event: H3Event) => Promise<{ skills: unknown[] }>
})

afterEach(() => {
  vi.useRealTimers()
  harness.close()
})

describe('tag profile cache', () => {
  it('serves the cached profile without recomputing within maxAge', async () => {
    const first = await handler(event())
    const second = await handler(event())

    expect(second).toEqual(first)
    expect(second.skills).toHaveLength(1)
    expect(handlerRuns).toBe(1)
  })

  it('serves a stale profile past maxAge and revalidates in the background', async () => {
    await handler(event())

    seedSkill('frontend-toolkit')
    advanceClock(cacheOptions!.maxAge + 1)

    const stale = await handler(event())
    expect(stale.skills).toHaveLength(1)

    await flushBackgroundRefresh()
    expect(handlerRuns).toBe(2)

    const revalidated = await handler(event())
    expect(revalidated.skills).toHaveLength(2)
  })

  it('keeps serving the stale profile when revalidation fails within the stale window', async () => {
    const fresh = await handler(event())

    harness.raw.prepare(`DELETE FROM skills WHERE owner = 'acme'`).run()
    advanceClock(cacheOptions!.maxAge + 1)

    await expect(handler(event())).resolves.toEqual(fresh)

    await flushBackgroundRefresh()
    expect(handlerRuns).toBe(2)

    advanceClock(cacheOptions!.maxAge + 1)
    await expect(handler(event())).resolves.toEqual(fresh)
    expect(handlerRuns).toBe(3)
  })

  it('propagates the 404 once the entry outlives maxAge plus the stale window', async () => {
    await handler(event())

    harness.raw.prepare(`DELETE FROM skills WHERE owner = 'acme'`).run()
    advanceClock(cacheOptions!.maxAge + (cacheOptions!.staleMaxAge ?? 0) + 1)

    await expect(handler(event())).rejects.toThrow('No skills tagged frontend')
    expect(handlerRuns).toBe(2)
  })

  it('recomputes synchronously past the stale window when the tag has skills again', async () => {
    const first = await handler(event())

    seedSkill('frontend-toolkit')
    advanceClock(cacheOptions!.maxAge + (cacheOptions!.staleMaxAge ?? 0) + 1)

    const recomputed = await handler(event())
    expect(recomputed.skills).toHaveLength(2)
    expect(recomputed).not.toEqual(first)
    expect(handlerRuns).toBe(2)

    const settled = await handler(event())
    expect(settled).toEqual(recomputed)
    expect(handlerRuns).toBe(2)
  })
})

function seedSkill(name: string) {
  harness.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved)
     VALUES ('acme', 'tools', ?, ?, ?, 1)`,
  ).run(name, `acme/tools/${name}`, name)
}

function advanceClock(seconds: number) {
  clockSec += seconds
  vi.setSystemTime(clockSec * 1000)
}

async function flushBackgroundRefresh() {
  await new Promise(resolve => setImmediate(resolve))
}

function event(): H3Event {
  return {
    context: { platform: { db: harness.db } },
  } as unknown as H3Event
}
