// @vitest-environment node
import type { EdgeCache, EdgeCacheStorageOptions } from '../../server/runtime/edge-cache-storage'
import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import edgeCacheDriver from '../../server/runtime/edge-cache-storage'

const { emitted } = vi.hoisted(() => ({
  emitted: [] as Array<Record<string, unknown>>,
}))

vi.mock('@harlan-zw/nuxt-wide-events/standalone', () => ({
  createWideEvent: (fields: Record<string, unknown>) => {
    emitted.push(fields)
    return { context: {}, setLevel: vi.fn(), emit: vi.fn(() => null) }
  },
}))

/** An in-memory Cache API that records the Cache-Control of every put. */
function memoryCache() {
  const entries = new Map<string, { body: string, cacheControl: string | null }>()
  const cache: EdgeCache = {
    match: async (request) => {
      const entry = entries.get(request.url)
      return entry ? new Response(entry.body) : undefined
    },
    put: async (request, response) => {
      entries.set(request.url, { body: await response.text(), cacheControl: response.headers.get('cache-control') })
    },
    delete: async request => entries.delete(request.url),
  }
  return { cache, entries }
}

function storageWith(cache: EdgeCache | undefined, defaultTtl?: number) {
  const storage = createStorage()
  storage.mount('edge-cache', edgeCacheDriver({ cache: () => cache, defaultTtl }))
  return storage
}

describe('edge-cache-storage driver', () => {
  beforeEach(() => {
    emitted.length = 0
  })

  it('round-trips a JSON value through the Cache API', async () => {
    const storage = storageWith(memoryCache().cache)
    await storage.setItem('edge-cache:skills:detail:v2:vueuse:skills:vueuse-functions', { v: { name: 'x' }, t: 1 })
    expect(await storage.getItem('edge-cache:skills:detail:v2:vueuse:skills:vueuse-functions'))
      .toEqual({ v: { name: 'x' }, t: 1 })
  })

  it('stores the requested TTL as the entry max-age', async () => {
    const { cache, entries } = memoryCache()
    await storageWith(cache).setItem('edge-cache:k', 'v', { ttl: 90_000 })
    expect([...entries.values()][0]!.cacheControl).toBe('public, max-age=90000')
  })

  it('falls back to the default TTL when the caller requests none', async () => {
    const { cache, entries } = memoryCache()
    await storageWith(cache, 600).setItem('edge-cache:k', 'v')
    expect([...entries.values()][0]!.cacheControl).toBe('public, max-age=600')
  })

  it('keeps keys with URL-significant characters distinct', async () => {
    const storage = storageWith(memoryCache().cache)
    await storage.setItem('edge-cache:a?b', 'query')
    await storage.setItem('edge-cache:a#b', 'hash')
    expect(await storage.getItem('edge-cache:a?b')).toBe('query')
    expect(await storage.getItem('edge-cache:a#b')).toBe('hash')
  })

  it('misses and drops writes outside Workers, where no cache exists', async () => {
    const storage = storageWith(undefined)
    await expect(storage.setItem('edge-cache:k', 'v')).resolves.toBeUndefined()
    expect(await storage.getItem('edge-cache:k')).toBeNull()
  })

  it('resolves a rejected put and reports it as a failed cache write', async () => {
    const { cache } = memoryCache()
    cache.put = async () => {
      throw new Error('413 Payload Too Large')
    }
    await expect(storageWith(cache).setItem('edge-cache:k', 'v')).resolves.toBeUndefined()
    expect(emitted).toEqual([{
      'operation': 'edge-cache-write',
      'outcome': 'failed',
      'cache.writeFailed': true,
      'reason': '413 Payload Too Large',
    }])
  })

  it('treats a rejected match as a miss and reports it', async () => {
    const { cache } = memoryCache()
    cache.match = async () => {
      throw new Error('cache unavailable')
    }
    expect(await storageWith(cache).getItem('edge-cache:k')).toBeNull()
    expect(emitted[0]).toMatchObject({ 'operation': 'edge-cache-read', 'cache.readFailed': true })
  })
})

// nuxt.config.ts relies on the `defineNuxtConfig` auto-global that only the
// Nuxt CLI provides. Unit tests import the file cold, so provide a
// pass-through first.
;
(globalThis as Record<string, unknown>).defineNuxtConfig ??= (config: unknown) => config

// The config turns `import.meta.url` into filesystem paths for two Nitro
// aliases. Vitest does not give that import a file scheme, so the real
// `fileURLToPath` rejects it. No test here reads an alias value, so the raw
// href is a fine stand-in.
vi.mock('node:url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:url')>()
  return {
    ...actual,
    fileURLToPath: (url: URL | string) => {
      try {
        return actual.fileURLToPath(url)
      }
      catch {
        return typeof url === 'string' ? url : url.href
      }
    },
  }
})

const config = await import('../../nuxt.config') as {
  default: {
    nitro?: {
      storage?: Record<string, Record<string, unknown> & { driver?: string }>
    }
  }
}

/**
 * skill-live's declared windows: maxAge 86400 (1d fresh) + staleMaxAge 604800
 * (7d stale). Nitro writes an SWR route's entry with no per-write TTL, so the
 * driver default decides the Cache API max-age for that write. It must
 * outlive the whole window, or the entry expires exactly as it goes stale and
 * the stale-while-revalidate window can never serve.
 */
const SKILL_LIVE_SWR_WINDOW_SECONDS = 691_200

describe('edge-cache-storage mount as production configures it', () => {
  it('keeps a no-TTL write past skill-live\'s fresh + stale window', async () => {
    const { driver: _driver, ...productionOptions } = config.default.nitro!.storage!['edge-cache']!
    const { cache, entries } = memoryCache()
    const storage = createStorage()
    storage.mount('edge-cache', edgeCacheDriver({ cache: () => cache, ...productionOptions } as EdgeCacheStorageOptions))
    await storage.setItem('edge-cache:skill-live:owner:repo:name', 'v')
    const cacheControl = [...entries.values()][0]!.cacheControl!
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)![1])
    expect(maxAge).toBeGreaterThanOrEqual(SKILL_LIVE_SWR_WINDOW_SECONDS)
  })
})
