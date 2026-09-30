import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// The skill detail route lost Nitro's stale-while-revalidate shield when it
// moved to a manual KV read-through cache (Sentry SKILLD-1V fix). Without
// SWR or single-flight, every concurrent request that lands after the 60s
// TTL expires re-runs the full handler, about six D1 queries plus a possible
// live GitHub render, and the ops triage ledger attributes recurring D1
// overload bursts (SKILLD-G/H/J/K/M/N/P/Q) to exactly this shape on these
// routes. These tests pin the replacement behaviour: one computation per key
// at a time, with stale entries served while a single refresh recomputes.
describe('skill detail SWR cache', () => {
  const NOW_SEC = Math.floor(Date.now() / 1000)
  const slug = 'ericzakariasson/scandinavian-design/alpha'
  const cacheKey = `skills:detail:v3:${slug}`
  let harness: SqliteD1
  let handler: (event: H3Event) => Promise<Record<string, unknown>>
  let prepareCalls: number

  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
  vi.stubGlobal('getUserSession', () => Promise.resolve(null))
  vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'slug' ? slug : undefined))

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
    const raw = `---\nname: alpha\ndescription: A alpha skill.\n---\n\nBody of alpha.\n`
    harness.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved,
         rendered_skill_path, rendered_status, rendered_raw, rendered_html, rendered_at)
       VALUES ('ericzakariasson', 'scandinavian-design', 'alpha', ?, 'alpha', 1,
         'skills/alpha/SKILL.md', 'ok', ?, '<p>ok</p>', ?)`,
    ).run(slug, raw, NOW_SEC)
    handler = (await import('../../layers/registry/server/api/skills/[...slug].get')).default
  })

  it('shares one computation between concurrent requests when the entry has expired', async () => {
    // The 60s TTL has passed: KV answers nothing, every request is a miss.
    const setItem = vi.fn(async () => {})
    vi.stubGlobal('useStorage', () => ({
      getItem: async () => null,
      setItem,
    }))
    const detailWrites = () => setItem.mock.calls.filter(([key]) => String(key).startsWith('skills:detail:')).length

    await handler(event())
    const singleRunQueries = prepareCalls

    const writesBeforeBurst = detailWrites()
    const beforeBurst = prepareCalls
    const results = await Promise.all(Array.from({ length: 8 }, () => handler(event())))
    const burstQueries = prepareCalls - beforeBurst

    expect(new Set(results).size).toBe(1)
    expect(burstQueries).toBeLessThanOrEqual(singleRunQueries)
    expect(detailWrites() - writesBeforeBurst).toBe(1)
  })

  it('serves a stale entry while exactly one refresh recomputes in the background', async () => {
    const cacheMap = new Map<string, unknown>()
    const setItem = vi.fn(async (key: string, value: unknown) => {
      cacheMap.set(key, value)
    })
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => cacheMap.get(key) ?? null,
      setItem,
    }))

    // Control run: one full compute, stored fresh in the cache.
    await handler(event())
    const singleRunQueries = prepareCalls
    const fresh = cacheMap.get(cacheKey) as { v: Record<string, unknown>, t: number }
    expect(fresh.v.registryPath).toBe('/gh/ericzakariasson/scandinavian-design')

    // Age the entry past the 60s TTL, into the 5 minute stale window.
    const staleT = Math.floor(Date.now() / 1000) - 61
    cacheMap.set(cacheKey, { v: fresh.v, t: staleT })

    const beforeBurst = prepareCalls
    const results = await Promise.all(Array.from({ length: 8 }, () => handler(event())))

    // Every request is served the stale value immediately.
    expect(results.every(result => result === fresh.v)).toBe(true)

    // One background refresh recomputes and writes the entry back.
    await vi.waitFor(() => {
      const written = cacheMap.get(cacheKey) as { v: Record<string, unknown>, t: number }
      expect(written.t).toBeGreaterThan(staleT)
    })
    expect(prepareCalls - beforeBurst).toBeLessThanOrEqual(singleRunQueries)
    const refreshed = cacheMap.get(cacheKey) as { v: Record<string, unknown>, t: number }
    expect(refreshed.v.registryPath).toBe('/gh/ericzakariasson/scandinavian-design')
    expect(refreshed.t).toBeGreaterThanOrEqual(fresh.t)
  })

  function event(): H3Event {
    return {
      context: { platform: { db: harness.db } },
      node: { req: { headers: {} } },
    } as unknown as H3Event
  }
})
