import type { H3Event } from 'h3'
import { readThroughCache } from '#shared/server/cache'

/** How long a feed answer stays fresh, then stale, in seconds. */
export interface FeedCacheWindow {
  ttl: number
  staleTtl: number
}

const DEFAULT_WINDOW: FeedCacheWindow = { ttl: 300, staleTtl: 3600 }
const ISOLATE_FEED_CACHE_MAX_MS = 60_000
export const MAX_ISOLATE_FEED_ENTRIES = 64
const isolateFeedCache = new Map<string, { value: unknown, expiresAt: number }>()

export type FeedCacheStorage = 'cache' | 'edge-cache'

function writeIsolateFeedCache(key: string, value: unknown, expiresAt: number, now: number): void {
  if (!isolateFeedCache.has(key) && isolateFeedCache.size >= MAX_ISOLATE_FEED_ENTRIES) {
    for (const [entryKey, entry] of isolateFeedCache) {
      if (entry.expiresAt <= now)
        isolateFeedCache.delete(entryKey)
    }
    while (isolateFeedCache.size >= MAX_ISOLATE_FEED_ENTRIES) {
      const oldestKey = isolateFeedCache.keys().next().value
      if (oldestKey === undefined)
        break
      isolateFeedCache.delete(oldestKey)
    }
  }
  isolateFeedCache.set(key, { value, expiresAt })
}

/** Keep each feed's last good answer through a bounded D1 outage. */
export async function cachedFeed<T>(
  event: H3Event,
  namespace: string,
  compute: () => Promise<T>,
  query: number[] = [],
  window: FeedCacheWindow = DEFAULT_WINDOW,
  storageName: FeedCacheStorage = 'cache',
): Promise<T> {
  const deployment = event.context.platform?.env?.CF_VERSION_METADATA?.id
  // A deployment identifies the response schema. Never reuse another release's
  // answer, and bypass shared storage when that identity is unavailable.
  if (typeof deployment !== 'string' || !deployment.trim())
    return compute()

  const identity = JSON.stringify([deployment, namespace, query])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  const key = `feed:v1:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
  const memKey = `${storageName}:${key}`

  const now = Date.now()
  const mem = isolateFeedCache.get(memKey)
  if (mem && mem.expiresAt > now) {
    setHeader(event, 'Cache-Control', 'max-age=300')
    return mem.value as T
  }

  // Canonical feeds use bounded KV keys to avoid costly D1 recomputes;
  // non-canonical queries fall back to `edge-cache` to cap billed KV writes.
  const value = await readThroughCache(useStorage(storageName), key, compute, window)
  writeIsolateFeedCache(
    memKey,
    value,
    now + Math.min(window.ttl * 1000, ISOLATE_FEED_CACHE_MAX_MS),
    now,
  )
  // Preserve the feed routes' existing browser freshness window.
  setHeader(event, 'Cache-Control', 'max-age=300')
  return value
}
