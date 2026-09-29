import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { defineDriver } from 'unstorage'
import { emitOperationalEvent } from '../utils/operational-event'

/**
 * The subset of the Workers `Cache` interface this driver calls. Structural,
 * so tests can pass a fake and the driver does not need workers-types.
 */
export interface EdgeCache {
  match: (request: Request) => Promise<Response | undefined>
  put: (request: Request, response: Response) => Promise<void>
  delete: (request: Request) => Promise<boolean>
}

export interface EdgeCacheStorageOptions {
  /** TTL applied to a write whose caller requests none. */
  defaultTtl?: number
  /**
   * Origin the cache keys are built on. It is a hostname inside the zone
   * with no DNS record, so no public request can ever address an entry.
   */
  origin?: string
  /** Resolves the cache. Defaults to `caches.default`, absent outside Workers. */
  cache?: () => EdgeCache | undefined
}

const DEFAULT_ORIGIN = 'https://edge-cache.skilld.dev'

function defaultCache(): EdgeCache | undefined {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function reportReadFailure(error: unknown): void {
  emitOperationalEvent(createWideEvent({
    'operation': 'edge-cache-read',
    'outcome': 'failed',
    'cache.readFailed': true,
    'reason': reason(error),
  }))
}

function reportWriteFailure(error: unknown): void {
  emitOperationalEvent(createWideEvent({
    'operation': 'edge-cache-write',
    'outcome': 'failed',
    'cache.writeFailed': true,
    'reason': reason(error),
  }))
}

function reportDeleteFailure(error: unknown): void {
  emitOperationalEvent(createWideEvent({
    operation: 'edge-cache-delete',
    outcome: 'failed',
    reason: reason(error),
  }))
}

/**
 * The `edge-cache` storage mount: the Workers Cache API behind unstorage.
 *
 * KV_CACHE bills every write at $5 per million, the most expensive unit on
 * this account. In September 2026 it took about 45k writes a day, and nine
 * in ten were per-entity read-through keys (`skills:detail:*`,
 * `skills:related:*`, `skill-live:*`, search vectors). Crawlers walk the
 * long tail of skills, so almost every one of those keys was written once
 * and read rarely, if ever. The Cache API costs nothing per write.
 *
 * The trade is scope: an entry lives in one data center, so a key read from
 * two colos computes twice. That suits a key whose recompute is a few D1
 * reads. A key that must be global, or whose recompute is expensive and
 * shared by every request (the sitemap, the duplicate-candidate set, the
 * gone-skill set), stays on the KV-backed `cache` mount.
 *
 * Every failure resolves and reports as a wide event. A failed read is a
 * miss, a failed write is a dropped entry, and neither decides the request.
 * Outside Workers (`nuxt dev`, Vitest) there is no `caches.default`, so the
 * mount is an always-miss cache.
 */
export default defineDriver((options: EdgeCacheStorageOptions = {}) => {
  const defaultTtl = options.defaultTtl ?? 24 * 60 * 60
  if (!Number.isSafeInteger(defaultTtl) || defaultTtl < 1)
    throw new Error(`[edge-cache-storage] defaultTtl must be a positive integer, received ${options.defaultTtl}`)
  const origin = options.origin ?? DEFAULT_ORIGIN
  const resolveCache = options.cache ?? defaultCache

  function keyRequest(key: string): Request {
    return new Request(`${origin}/${encodeURIComponent(key)}`)
  }

  async function read(key: string): Promise<string | null> {
    const cache = resolveCache()
    if (!cache)
      return null
    const response = await cache.match(keyRequest(key)).catch((error: unknown) => {
      reportReadFailure(error)
      return undefined
    })
    return response ? response.text() : null
  }

  return {
    name: 'cloudflare-edge-cache',
    options,
    flags: { ttl: true },
    async hasItem(key) {
      return (await read(key)) !== null
    },
    getItem: read,
    async setItem(key, value, transactionOptions = {}) {
      const cache = resolveCache()
      if (!cache)
        return
      const requestedTtl = Number(transactionOptions.ttl)
      const ttl = Number.isFinite(requestedTtl) && requestedTtl > 0 ? Math.ceil(requestedTtl) : defaultTtl
      const response = new Response(value, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': `public, max-age=${ttl}`,
        },
      })
      await cache.put(keyRequest(key), response).catch(reportWriteFailure)
    },
    async removeItem(key) {
      const cache = resolveCache()
      if (!cache)
        return
      await cache.delete(keyRequest(key)).catch(reportDeleteFailure)
    },
    // The Cache API cannot enumerate. Nothing here lists or clears the mount.
    getKeys: () => [],
    clear: () => {},
  }
})
