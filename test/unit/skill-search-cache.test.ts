import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// The skills search route was the last one on Nitro's `defineCachedEventHandler`
// (Sentry SKILLD-28): whether a failed KV read reaches the request depended on
// which catch Nitro's own cache layer ships. It now caches through the shared
// `cached` shield like the detail route (#146) and skill-files (#201). These
// tests pin the migration: a dead KV never fails the request, and the old
// cache identity (deployment-scoped full query string) is unchanged.
describe('skills search route cache', () => {
  let harness: SqliteD1
  let handler: (event: H3Event) => Promise<Record<string, unknown>>
  let queries: number
  let deployment: string | undefined
  let cacheStorage: { getItem: (key: string) => Promise<unknown>, setItem: (key: string, value: unknown) => Promise<void> }
  let cacheMap: Map<string, unknown>

  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
  vi.stubGlobal('getUserSession', () => Promise.resolve(null))
  vi.stubGlobal('getQuery', (event: H3Event) => {
    const search = (event.node?.req?.url ?? '').split('?')[1] ?? ''
    return Object.fromEntries(new URLSearchParams(search))
  })
  vi.stubGlobal('useStorage', () => cacheStorage)

  beforeEach(async () => {
    vi.resetModules()
    harness = createSqliteD1(allMigrations())
    queries = 0
    deployment = 'deployment-a'
    handler = (await import('../../layers/registry/server/api/skills/index.get')).default
  })

  function countingDb(): D1Database {
    return {
      prepare: (sql: string) => {
        queries++
        return harness.db.prepare(sql)
      },
      batch: async (statements: never[]) => {
        queries++
        return harness.db.batch(statements)
      },
    } as unknown as D1Database
  }

  function seedSkill(owner: string, repo: string, name: string): void {
    harness.raw.prepare('INSERT OR IGNORE INTO repos (owner, repo, stars) VALUES (?, ?, 1000)').run(owner, repo)
    harness.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved) VALUES (?, ?, ?, ?, ?, 1)`,
    ).run(owner, repo, name, `${owner}/${repo}/${name}`, name)
  }

  function event(query: string): H3Event {
    return {
      context: {
        platform: {
          db: countingDb(),
          env: deployment ? { CF_VERSION_METADATA: { id: deployment } } : {},
        },
      },
      node: { req: { headers: {}, url: `/api/skills${query}`, originalUrl: `/api/skills${query}` } },
    } as unknown as H3Event
  }

  function mapStorage(): void {
    cacheMap = new Map()
    cacheStorage = {
      getItem: async key => cacheMap.get(key) ?? null,
      setItem: async (key, value) => {
        cacheMap.set(key, value)
      },
    }
  }

  it('serves the response when the KV cache read fails', async () => {
    const setItem = vi.fn(async () => {})
    cacheStorage = {
      getItem: async () => {
        throw new Error('KV GET failed: 500 Internal Server Error')
      },
      setItem,
    }
    seedSkill('antfu', 'vite', 'gate')

    await expect(handler(event('?owner=antfu'))).resolves.toMatchObject({ total: 1 })

    // The failed read was treated as a miss: the compute ran and the result
    // was written back for the next request.
    expect(setItem).toHaveBeenCalledOnce()
  })

  it('reuses a fresh response within a deployment and recomputes after a deployment', async () => {
    mapStorage()
    seedSkill('antfu', 'vite', 'gate')

    await expect(handler(event('?owner=antfu'))).resolves.toMatchObject({ total: 1 })

    seedSkill('antfu', 'vite', 'nano-steps')
    queries = 0
    await expect(handler(event('?owner=antfu'))).resolves.toMatchObject({ total: 1 })
    expect(queries).toBe(0)

    deployment = 'deployment-b'
    await expect(handler(event('?owner=antfu'))).resolves.toMatchObject({ total: 2 })
    expect(queries).toBeGreaterThan(0)
  })

  it('shares cache entries when query parameter order changes', async () => {
    mapStorage()
    seedSkill('antfu', 'vite', 'gate')

    await expect(handler(event('?owner=antfu&sort=name'))).resolves.toMatchObject({ total: 1 })

    queries = 0
    await expect(handler(event('?sort=name&owner=antfu'))).resolves.toMatchObject({ total: 1 })
    expect(queries).toBe(0)
  })

  it('keeps punctuation-distinct filters in separate cache entries', async () => {
    mapStorage()
    seedSkill('foo-bar', 'repo', 'gate')
    seedSkill('foobar', 'repo', 'gate')

    await expect(handler(event('?owner=foo-bar'))).resolves.toMatchObject({ total: 1 })
    await expect(handler(event('?owner=foobar'))).resolves.toMatchObject({ total: 1 })
    expect(cacheMap.size).toBe(2)
  })

  it('bypasses caching when the deployment binding is absent', async () => {
    const getItem = vi.fn(async () => null)
    const setItem = vi.fn(async () => {})
    cacheStorage = { getItem, setItem }
    deployment = undefined
    seedSkill('antfu', 'vite', 'gate')

    await expect(handler(event('?owner=antfu'))).resolves.toMatchObject({ total: 1 })

    seedSkill('antfu', 'vite', 'nano-steps')
    await expect(handler(event('?owner=antfu'))).resolves.toMatchObject({ total: 2 })

    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('serves a stale entry while exactly one refresh recomputes in the background', async () => {
    mapStorage()
    seedSkill('antfu', 'vite', 'gate')

    await handler(event('?owner=antfu'))
    const singleRunQueries = queries
    const key = [...cacheMap.keys()][0] as string
    const fresh = cacheMap.get(key) as { v: Record<string, unknown>, t: number }

    // Age the entry past the 60s TTL, into the 5 minute stale window.
    const staleT = Math.floor(Date.now() / 1000) - 61
    cacheMap.set(key, { v: fresh.v, t: staleT })
    queries = 0
    const results = await Promise.all(Array.from({ length: 8 }, () => handler(event('?owner=antfu'))))

    // Every request is served a cached value, never an error, and the burst
    // costs at most one recompute. The key hash is a macrotask per request
    // (crypto.subtle), so some requests land after the background refresh has
    // written the fresh entry; with instant in-memory storage that refresh can
    // even finish between two requests, which real KV latency spreads out.
    const served = new Set(results)
    expect(served.size).toBeLessThanOrEqual(2)
    expect(results.every(result => result.total === 1)).toBe(true)
    expect(queries).toBeLessThanOrEqual(singleRunQueries)

    await vi.waitFor(() => {
      const refreshed = cacheMap.get(key) as { t: number }
      expect(refreshed.t).toBeGreaterThan(staleT)
    })
  })
})
