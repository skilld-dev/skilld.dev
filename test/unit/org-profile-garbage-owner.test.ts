import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// Crawler-invented owner paths used to 404 correctly but still paid one
// unauthenticated GitHub users API call per miss and upserted a permanent
// owners row with sync_status='404' for every garbage path (issue #260).
// The registry query gates the owner load, so a path with no skills must
// 404 before either side effect happens.
describe('org profile garbage owner', () => {
  const owner = 'not-a-real-owner-xyz'
  let harness: SqliteD1
  let githubFetch: ReturnType<typeof vi.fn>
  let handler: (event: H3Event) => Promise<unknown>
  let cacheMap: Map<string, unknown>

  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
  vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'owner' ? owner : undefined))
  vi.stubGlobal('$fetch', async () => {
    throw new Error('ungh.cc must not be reached for a garbage owner')
  })

  beforeEach(async () => {
    vi.resetModules()
    harness = createSqliteD1(allMigrations())

    githubFetch = vi.fn(async () => {
      throw new Error('GitHub users API must not be reached for a garbage owner')
    })
    vi.stubGlobal('fetch', githubFetch)

    cacheMap = new Map()
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => cacheMap.get(key) ?? null,
      setItem: async (key: string, value: unknown) => {
        cacheMap.set(key, value)
      },
    }))

    handler = (await import('../../layers/registry/server/api/orgs/[owner].get')).default
  })

  it('404s without a GitHub fetch or an owners row', async () => {
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 404 })

    expect(githubFetch).not.toHaveBeenCalled()

    const row = harness.raw.prepare('SELECT owner FROM owners WHERE owner = ?').get(owner)
    expect(row).toBeUndefined()
    expect(cacheMap.size).toBe(0)
  })

  function event(): H3Event {
    return {
      context: {
        platform: { db: harness.db },
        cloudflare: { context: { waitUntil: () => {} } },
      },
      node: { req: { headers: {} } },
    } as unknown as H3Event
  }
})
