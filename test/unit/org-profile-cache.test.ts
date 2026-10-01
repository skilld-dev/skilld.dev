import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// The org profile route was a bare handler: every crawler hit ran the full
// querySkills pass, the owners read, the repo source identity query, the
// generated-tags batch and the sync summary, plus a per-repo ungh.cc fetch
// (SKILLD-1M, SKILLD-1N and the 2026-08-05 orgs family). These tests pin the
// read-through SWR cache that stands in front of it: one D1 pass per owner
// while the entry is fresh, stale entries served while exactly one refresh
// recomputes in the background, and concurrent cold misses sharing a single
// computation.
describe('org profile SWR cache', () => {
  const NOW_SEC = Math.floor(Date.now() / 1000)
  const owner = 'acme'
  const cacheKey = `orgs:profile:v1:${owner}`
  let harness: SqliteD1
  let handler: (event: H3Event) => Promise<Record<string, unknown>>
  let prepareCalls: number
  let scheduled: Promise<unknown>[]

  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
  vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'owner' ? owner : undefined))
  vi.stubGlobal('$fetch', async (url: string) => ({ repo: { description: `Repo served for ${url}` } }))

  beforeEach(async () => {
    vi.resetModules()
    harness = createSqliteD1(allMigrations())
    prepareCalls = 0
    scheduled = []
    const db = harness.db as unknown as { prepare: (sql: string) => unknown }
    const realPrepare = db.prepare.bind(db)
    db.prepare = (sql: string) => {
      prepareCalls++
      return realPrepare(sql)
    }

    harness.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('acme', 'skills')`).run()
    const raw = `---\nname: deploy\ndescription: A deploy skill.\n---\n\nBody of deploy.\n`
    harness.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved,
         rendered_skill_path, rendered_status, rendered_raw, rendered_html, rendered_at)
       VALUES ('acme', 'skills', 'deploy', ?, 'deploy', 1,
         'skills/deploy/SKILL.md', 'ok', ?, '<p>ok</p>', ?)`,
    ).run('acme-skills-deploy', raw, NOW_SEC)
    // A fresh owners row keeps the profile compute away from the live GitHub
    // users API, which this test must never call.
    harness.raw.prepare(
      `INSERT INTO owners (owner, kind, name, sync_status, last_synced_at)
       VALUES ('acme', 'org', 'Acme', 'ok', ?)`,
    ).run(NOW_SEC)

    handler = (await import('../../layers/registry/server/api/orgs/[owner].get')).default
  })

  it('serves a second request from the cache without a second D1 pass', async () => {
    const cacheMap = new Map<string, unknown>()
    const setItem = vi.fn(async (key: string, value: unknown) => {
      cacheMap.set(key, value)
    })
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => cacheMap.get(key) ?? null,
      setItem,
    }))

    const first = await handler(event())
    const singleRunQueries = prepareCalls
    expect(cacheMap.has(cacheKey)).toBe(true)

    const second = await handler(event())

    expect(second).toBe(first)
    expect(prepareCalls).toBe(singleRunQueries)
  })

  it('serves a stale entry while one refresh recomputes through waitUntil', async () => {
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
    expect(fresh.v.owner).toBe(owner)

    // Age the entry past the 60s TTL, into the 5 minute stale window.
    const staleT = Math.floor(Date.now() / 1000) - 61
    cacheMap.set(cacheKey, { v: fresh.v, t: staleT })

    const beforeStale = prepareCalls
    const stale = await handler(event())

    // The stale value is served immediately; the refresh runs in the
    // background through the event's waitUntil.
    expect(stale).toBe(fresh.v)
    expect(scheduled.length).toBe(1)
    await scheduled[0]
    expect(prepareCalls - beforeStale).toBeLessThanOrEqual(singleRunQueries)

    await vi.waitFor(() => {
      const refreshed = cacheMap.get(cacheKey) as { v: Record<string, unknown>, t: number }
      expect(refreshed.t).toBeGreaterThan(staleT)
    })
  })

  it('shares one computation between concurrent requests on a cold miss', async () => {
    const setItem = vi.fn(async () => {})
    vi.stubGlobal('useStorage', () => ({
      getItem: async () => null,
      setItem,
    }))

    await handler(event())
    const singleRunQueries = prepareCalls
    const writesBeforeBurst = setItem.mock.calls.filter(([key]) => key === cacheKey).length

    const beforeBurst = prepareCalls
    const results = await Promise.all(Array.from({ length: 8 }, () => handler(event())))
    const burstQueries = prepareCalls - beforeBurst

    expect(new Set(results).size).toBe(1)
    expect(burstQueries).toBeLessThanOrEqual(singleRunQueries)
    const profileWrites = setItem.mock.calls.filter(([key]) => key === cacheKey).length
    expect(profileWrites - writesBeforeBurst).toBe(1)
  })

  it('gives the ungh read a timeout and caches nothing when it fails', async () => {
    const cacheMap = new Map<string, unknown>()
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => cacheMap.get(key) ?? null,
      setItem: async (key: string, value: unknown) => {
        cacheMap.set(key, value)
      },
    }))
    const ungh = vi.fn(async (..._args: unknown[]): Promise<unknown> => {
      throw new Error('The operation was aborted due to timeout')
    })
    vi.stubGlobal('$fetch', ungh)
    vi.resetModules()
    handler = (await import('../../layers/registry/server/api/orgs/[owner].get')).default

    const body = await handler(event()) as { repos: Array<{ description: string | null }> }

    expect(ungh).toHaveBeenCalledWith('https://ungh.cc/repos/acme/skills', expect.objectContaining({ timeout: 4000, retry: 0 }))
    expect(body.repos[0]!.description).toBeNull()
    expect([...cacheMap.keys()].some(key => key.includes('github:repo-desc'))).toBe(false)
  })

  function event(): H3Event {
    return {
      context: {
        platform: { db: harness.db },
        cloudflare: { context: { waitUntil: (promise: Promise<unknown>) => scheduled.push(promise) } },
      },
      node: { req: { headers: {} } },
    } as unknown as H3Event
  }
})
