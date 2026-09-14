// @vitest-environment node
import type { H3Event } from 'h3'
import type { DatabaseSync } from 'node:sqlite'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

interface CacheOptions {
  maxAge?: number
  staleMaxAge?: number
  swr?: boolean
}

/**
 * Nitro's cached-handler decision boundaries, minus the background refresh: an
 * entry serves until `maxAge`; with `swr` it keeps serving until
 * `maxAge + staleMaxAge`; past that the next request recomputes. With
 * `swr: false` there is no stale window at all, so the recompute test passes
 * and the stale-window test fails.
 */
function stubServerGlobals(): void {
  vi.stubGlobal('defineCachedEventHandler', (
    handler: (event: H3Event) => Promise<unknown>,
    options: CacheOptions = {},
  ) => {
    const maxAgeMs = (options.maxAge ?? 1) * 1000
    const staleMs = options.swr ? (options.staleMaxAge ?? 0) * 1000 : 0
    let entry: { value: unknown, expiresAt: number } | undefined
    return async (event: H3Event) => {
      if (entry && Date.now() < entry.expiresAt + staleMs)
        return entry.value
      const value = await handler(event)
      entry = { value, expiresAt: Date.now() + maxAgeMs }
      return value
    }
  })
  vi.stubGlobal('getRouterParam', (event: H3Event, key: string) =>
    (event.context.params as Record<string, string> | undefined)?.[key])
  vi.stubGlobal('getQuery', (event: H3Event) =>
    (event.context as { query?: Record<string, unknown> }).query ?? {})
  vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input))
}

const MAX_AGE_S = 60
const STALE_MAX_AGE_S = 300

let harness: SqliteD1
let queries = 0
let handler: (event: H3Event) => Promise<unknown>

function event(context: { params?: Record<string, string> } = {}): H3Event {
  return {
    context: { platform: { db: dbWithQueryCount() }, ...context },
  } as unknown as H3Event
}

function dbWithQueryCount(): D1Database {
  return {
    prepare: (sql: string) => {
      queries++
      return harness.db.prepare(sql)
    },
  } as unknown as D1Database
}

function seedSkill(raw: DatabaseSync, name: string): void {
  raw.prepare('INSERT OR IGNORE INTO repos (owner, repo, stars) VALUES (?, ?, 1000)').run('emilkowalski', 'emil-design-eng')
  raw.prepare(`
    INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, is_abstract, abstractness_category)
    VALUES ('emilkowalski', 'emil-design-eng', ?, ?, ?, 1, 1, 'interface-design')
  `).run(name, `emilkowalski/emil-design-eng/${name}`, name)
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  stubServerGlobals()
  vi.resetModules()
  harness = createSqliteD1(allMigrations())
  seedSkill(harness.raw, 'emil-design-eng')
  queries = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  harness.close()
})

describe('cluster index cache', () => {
  it('serves stale results within the stale-while-revalidate window', async () => {
    handler = (await import('../../layers/registry/server/api/clusters/index.get')).default

    await handler(event())
    expect(queries).toBeGreaterThan(0)

    seedSkill(harness.raw, 'motion-for-the-web')
    queries = 0
    vi.setSystemTime(MAX_AGE_S * 1000 + 1000)

    const res = await handler(event()) as { items: Array<{ slug: string, skillCount: number }> }
    expect(queries).toBe(0)
    expect(res.items).toHaveLength(1)
    expect(res.items[0]?.skillCount).toBe(1)
  })

  it('recomputes once the stale window has passed', async () => {
    handler = (await import('../../layers/registry/server/api/clusters/index.get')).default

    await handler(event())
    seedSkill(harness.raw, 'motion-for-the-web')
    queries = 0
    vi.setSystemTime((MAX_AGE_S + STALE_MAX_AGE_S) * 1000 + 1000)

    const res = await handler(event()) as { items: Array<{ slug: string, skillCount: number }> }
    expect(queries).toBeGreaterThan(0)
    expect(res.items).toHaveLength(1)
    expect(res.items[0]?.skillCount).toBe(2)
  })
})

describe('cluster detail cache', () => {
  it('serves stale results within the stale-while-revalidate window', async () => {
    handler = (await import('../../layers/registry/server/api/clusters/[slug].get')).default

    await handler(event({ params: { slug: 'design' } }))
    expect(queries).toBe(2)

    seedSkill(harness.raw, 'motion-for-the-web')
    queries = 0
    vi.setSystemTime(MAX_AGE_S * 1000 + 1000)

    const res = await handler(event({ params: { slug: 'design' } })) as { total: number, items: unknown[] }
    expect(queries).toBe(0)
    expect(res.total).toBe(1)
    expect(res.items).toHaveLength(1)
  })

  it('recomputes once the stale window has passed', async () => {
    handler = (await import('../../layers/registry/server/api/clusters/[slug].get')).default

    await handler(event({ params: { slug: 'design' } }))
    seedSkill(harness.raw, 'motion-for-the-web')
    queries = 0
    vi.setSystemTime((MAX_AGE_S + STALE_MAX_AGE_S) * 1000 + 1000)

    const res = await handler(event({ params: { slug: 'design' } })) as { total: number, items: unknown[] }
    expect(queries).toBe(2)
    expect(res.total).toBe(2)
    expect(res.items).toHaveLength(2)
  })
})
