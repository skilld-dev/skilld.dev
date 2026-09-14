import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// GET /api/users/:login/skills ran as a bare handler, so every crawler hit
// repeated the same per-login D1 reads and the route landed as SKILLD-1K in
// the D1 overload burst. These tests pin the read-through cache the skill
// detail route already uses: one query per login per fresh window, stale
// entries served while a single refresh recomputes, and one key per login
// no matter which casing the URL used.
describe('user skills cache', () => {
  const NOW_SEC = Math.floor(Date.now() / 1000)
  const login = 'ericzakariasson'
  const cacheKey = `user-skills:${login}`
  let harness: SqliteD1
  let handler: (event: H3Event) => Promise<{ ok: boolean, items: Record<string, unknown>[] }>
  let prepareCalls: number

  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
  vi.stubGlobal('getUserSession', () => Promise.resolve(null))
  vi.stubGlobal('getRouterParam', (event: unknown, key: string) =>
    (event as { context: { params?: Record<string, string> } }).context.params?.[key])

  beforeEach(async () => {
    vi.resetModules()
    harness = createSqliteD1(allMigrations())
    prepareCalls = 0
    const db = harness.db as unknown as { prepare: (sql: string) => unknown }
    const realPrepare = db.prepare.bind(db)
    db.prepare = (sql: string) => {
      prepareCalls++
      return realPrepare(sql)
    }

    harness.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('ericzakariasson', 'scandinavian-design')`).run()
    harness.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, modified_at)
       VALUES ('ericzakariasson', 'scandinavian-design', 'alpha', ?, 'alpha', 1, ?)`,
    ).run(`${login}/scandinavian-design/alpha`, NOW_SEC)
    handler = (await import('../../server/api/users/[login]/skills.get')).default
  })

  it('serves a repeat request from the cache without repeating the D1 query', async () => {
    const cacheMap = new Map<string, unknown>()
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => cacheMap.get(key) ?? null,
      setItem: async (key: string, value: unknown) => {
        cacheMap.set(key, value)
      },
    }))

    const first = await handler(event())
    expect(first.ok).toBe(true)
    expect(first.items).toHaveLength(1)
    const singleRunQueries = prepareCalls

    const second = await handler(event())
    expect(second).toEqual(first)
    expect(prepareCalls).toBe(singleRunQueries)
  })

  it('shares one cache entry between casings of the same login', async () => {
    const cacheMap = new Map<string, unknown>()
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => cacheMap.get(key) ?? null,
      setItem: async (key: string, value: unknown) => {
        cacheMap.set(key, value)
      },
    }))

    await handler(event())
    expect(cacheMap.has(cacheKey)).toBe(true)

    const before = prepareCalls
    const mixed = await handler(event('EricZakariasson'))
    expect(mixed.items).toHaveLength(1)
    expect(prepareCalls).toBe(before)
  })

  it('serves a stale entry while exactly one refresh recomputes in the background', async () => {
    const cacheMap = new Map<string, unknown>()
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => cacheMap.get(key) ?? null,
      setItem: async (key: string, value: unknown) => {
        cacheMap.set(key, value)
      },
    }))

    await handler(event())
    const singleRunQueries = prepareCalls
    const fresh = cacheMap.get(cacheKey) as { v: { items: unknown[] }, t: number }
    expect(fresh.v.items).toHaveLength(1)

    // Age the entry past the 60s TTL, into the 5 minute stale window.
    const staleT = Math.floor(Date.now() / 1000) - 61
    cacheMap.set(cacheKey, { v: fresh.v, t: staleT })

    const before = prepareCalls
    const results = await Promise.all(Array.from({ length: 8 }, () => handler(event())))

    // Every request is served the stale value immediately.
    expect(results.every(result => result === fresh.v)).toBe(true)

    // One background refresh recomputes and writes the entry back.
    await vi.waitFor(() => {
      const written = cacheMap.get(cacheKey) as { v: { items: unknown[] }, t: number }
      expect(written.t).toBeGreaterThan(staleT)
    })
    expect(prepareCalls - before).toBeLessThanOrEqual(singleRunQueries)
  })

  function event(loginParam: string = login): H3Event {
    return {
      context: { params: { login: loginParam }, platform: { db: harness.db } },
      node: { req: { headers: {} } },
    } as unknown as H3Event
  }
})
