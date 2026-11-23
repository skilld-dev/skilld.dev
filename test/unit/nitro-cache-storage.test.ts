import type { KVNamespace } from '@cloudflare/workers-types'
import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import kvCacheDriver from '../../server/runtime/kv-cache-storage'

const { emitted } = vi.hoisted(() => ({
  emitted: [] as Array<Record<string, unknown>>,
}))

vi.mock('@harlan-zw/nuxt-wide-events/standalone', () => ({
  createWideEvent: (fields: Record<string, unknown>) => {
    emitted.push(fields)
    return { context: {}, setLevel: vi.fn(), emit: vi.fn(() => null) }
  },
}))

function kvNamespace(put: KVNamespace['put'], get: KVNamespace['get'] = vi.fn(async () => null) as unknown as KVNamespace['get']): KVNamespace {
  return {
    get,
    put,
    delete: vi.fn(async () => {}),
  } as unknown as KVNamespace
}

describe('kv-cache-storage driver', () => {
  beforeEach(() => {
    emitted.length = 0
  })

  it('resolves when the KV write is rate limited and reports it as a failed cache write', async () => {
    const binding = kvNamespace(vi.fn(async () => {
      throw new Error('KV PUT failed: 429 Too Many Requests')
    }))
    vi.stubGlobal('KV_CACHE_TEST', binding)

    const storage = createStorage()
    storage.mount('cache', kvCacheDriver({ binding: 'KV_CACHE_TEST', defaultTtl: 120 }))

    await expect(storage.setItem('cache:nitro:functions:llms-txt:hot.json', { served: true }))
      .resolves
      .toBeUndefined()

    expect(emitted).toEqual([{
      'operation': 'cache-write',
      'outcome': 'failed',
      'cache.writeFailed': true,
      'reason': 'KV PUT failed: 429 Too Many Requests',
    }])

    vi.unstubAllGlobals()
  })

  it('reads a KV outage as a miss and reports it as a failed cache read', async () => {
    const get = vi.fn(async () => {
      throw new Error('KV GET failed: 500 Internal Server Error')
    })
    vi.stubGlobal('KV_CACHE_TEST', kvNamespace(vi.fn(async () => {}), get as unknown as KVNamespace['get']))

    const storage = createStorage()
    storage.mount('cache', kvCacheDriver({ binding: 'KV_CACHE_TEST', defaultTtl: 120 }))

    await expect(storage.getItem('cache:nitro:handlers:repo:tag-network.json')).resolves.toBeNull()
    expect(emitted).toEqual([{
      'operation': 'cache-read',
      'outcome': 'failed',
      'cache.readFailed': true,
      'reason': 'KV GET failed: 500 Internal Server Error',
    }])

    vi.unstubAllGlobals()
  })

  it('applies the default TTL when the caller requests none', async () => {
    const put = vi.fn(async () => {})
    vi.stubGlobal('KV_CACHE_TEST', kvNamespace(put as unknown as KVNamespace['put']))

    const storage = createStorage()
    storage.mount('cache', kvCacheDriver({ binding: 'KV_CACHE_TEST', defaultTtl: 120 }))
    await storage.setItem('cache:nitro:functions:llms-txt:hot.json', { served: true })

    expect(put).toHaveBeenCalledOnce()
    expect(put).toHaveBeenCalledWith(
      'nitro:functions:llms-txt:hot.json',
      expect.stringContaining('served'),
      expect.objectContaining({ expirationTtl: 120 }),
    )

    vi.unstubAllGlobals()
  })

  it('raises a requested TTL below the KV one-write-per-second floor to 60 seconds', async () => {
    const put = vi.fn(async () => {})
    vi.stubGlobal('KV_CACHE_TEST', kvNamespace(put as unknown as KVNamespace['put']))

    const storage = createStorage()
    storage.mount('cache', kvCacheDriver({ binding: 'KV_CACHE_TEST', defaultTtl: 120 }))
    await storage.setItem('cache:short', 'v', { ttl: 5 })

    expect(put).toHaveBeenCalledWith(
      'short',
      'v',
      expect.objectContaining({ expirationTtl: 60 }),
    )

    vi.unstubAllGlobals()
  })
})
