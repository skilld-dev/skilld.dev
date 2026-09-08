import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

interface CapturedCacheOptions {
  maxAge: number
  staleMaxAge?: number
  swr?: boolean | number
}

/**
 * Nitro's cached-handler contract for the options this handler passes:
 * within maxAge serve the cached value; past maxAge with swr enabled serve
 * the stale value immediately and revalidate in the background (a failed
 * refresh keeps the stale entry); with swr disabled recompute synchronously.
 */
let cacheOptions: CapturedCacheOptions | undefined
let handlerRuns = 0
let clockSec = 0

vi.stubGlobal('defineCachedEventHandler', (handler: (event: H3Event) => Promise<unknown>, options: CapturedCacheOptions) => {
  cacheOptions = options
  let entry: { value: unknown, cachedAt: number } | null = null
  return async (event: H3Event) => {
    const freshUntil = entry ? entry.cachedAt + options.maxAge : 0
    const staleUntil = entry ? entry.cachedAt + options.maxAge + (options.staleMaxAge ?? 0) : 0
    if (entry && clockSec <= freshUntil)
      return entry.value
    if (entry && options.swr && clockSec <= staleUntil) {
      const stale = entry.value
      handlerRuns++
      void handler(event)
        .then((fresh) => {
          entry = { value: fresh, cachedAt: clockSec }
        })
        .catch(() => {
          // Nitro discards a failed background refresh; the stale entry stays.
        })
      return stale
    }
    handlerRuns++
    const value = await handler(event)
    entry = { value, cachedAt: clockSec }
    return value
  }
})

vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'slug' ? 'frontend' : undefined))
vi.stubGlobal('getQuery', () => ({}))
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))

let harness: SqliteD1
let handler: (event: H3Event) => Promise<{ skills: unknown[] }>

beforeEach(async () => {
  vi.resetModules()
  cacheOptions = undefined
  handlerRuns = 0
  clockSec = 1_000_000
  harness = createSqliteD1(allMigrations())
  harness.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('acme', 'tools')`).run()
  seedSkill('frontend-lint')
  handler = (await import('../../layers/registry/server/api/tags/[slug].get')).default
})

afterEach(() => {
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
    clockSec += cacheOptions!.maxAge + 1

    const stale = await handler(event())
    expect(stale.skills).toHaveLength(1)

    await flushBackgroundRefresh()
    expect(handlerRuns).toBe(2)

    const revalidated = await handler(event())
    expect(revalidated.skills).toHaveLength(2)
  })

  it('keeps serving the stale profile when revalidation fails', async () => {
    const fresh = await handler(event())

    harness.raw.prepare(`DELETE FROM skills WHERE owner = 'acme'`).run()
    clockSec += cacheOptions!.maxAge + 1

    await expect(handler(event())).resolves.toEqual(fresh)

    await flushBackgroundRefresh()
    expect(handlerRuns).toBe(2)

    clockSec += cacheOptions!.maxAge + 1
    await expect(handler(event())).resolves.toEqual(fresh)
    expect(handlerRuns).toBe(3)
  })
})

function seedSkill(name: string) {
  harness.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved)
     VALUES ('acme', 'tools', ?, ?, ?, 1)`,
  ).run(name, `acme/tools/${name}`, name)
}

async function flushBackgroundRefresh() {
  await new Promise(resolve => setImmediate(resolve))
}

function event(): H3Event {
  return {
    context: { platform: { db: harness.db } },
  } as unknown as H3Event
}
