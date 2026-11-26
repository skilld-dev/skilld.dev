import type { H3Event } from 'h3'
import { readThroughCache } from '#shared/server/cache'

/** How long a feed answer stays fresh, then stale, in seconds. */
export interface FeedCacheWindow {
  ttl: number
  staleTtl: number
}

const DEFAULT_WINDOW: FeedCacheWindow = { ttl: 300, staleTtl: 3600 }
const ISOLATE_FEED_CACHE_MAX_MS = 60_000
const isolateFeedCache = new Map<string, { value: unknown, expiresAt: number }>()

/** Keep each feed's last good answer through a bounded D1 outage. */
export async function cachedFeed<T>(
  event: H3Event,
  namespace: string,
  compute: () => Promise<T>,
  query: number[] = [],
  window: FeedCacheWindow = DEFAULT_WINDOW,
): Promise<T> {
  const deployment = event.context.platform?.env?.CF_VERSION_METADATA?.id
  // A deployment identifies the response schema. Never reuse another release's
  // answer, and bypass shared storage when that identity is unavailable.
  if (typeof deployment !== 'string' || !deployment.trim())
    return compute()

  const identity = JSON.stringify([deployment, namespace, query])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  const key = `feed:v1:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`

  const now = Date.now()
  const mem = isolateFeedCache.get(key)
  if (mem && mem.expiresAt > now) {
    setHeader(event, 'Cache-Control', 'max-age=300')
    return mem.value as T
  }

  // Global feeds (recent-publishes, recent-updates, trending) have a tiny
  // fixed key cardinality (~6 keys) and expensive multi-table D1 recomputes.
  // Storing them in the global KV `cache` mount avoids per-colo Cache API
  // misses across hundreds of PoPs while keeping KV writes under ~500/day.
  const value = await readThroughCache(useStorage('cache'), key, compute, window)
  isolateFeedCache.set(key, {
    value,
    expiresAt: now + Math.min(window.ttl * 1000, ISOLATE_FEED_CACHE_MAX_MS),
  })
  // Preserve the feed routes' existing browser freshness window.
  setHeader(event, 'Cache-Control', 'max-age=300')
  return value
}
