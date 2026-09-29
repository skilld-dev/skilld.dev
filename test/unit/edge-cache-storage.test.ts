import type { EdgeCache } from '../../server/runtime/edge-cache-storage'
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
