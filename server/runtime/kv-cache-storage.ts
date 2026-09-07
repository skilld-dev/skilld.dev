import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { defineDriver } from 'unstorage'
import cloudflareKvBinding from 'unstorage/drivers/cloudflare-kv-binding'
import { emitOperationalEvent } from '../utils/operational-event'

/** Cloudflare KV rejects an expirationTtl below 60 seconds. */
const MIN_TTL_SECONDS = 60

export interface KvCacheStorageOptions {
  /** The wrangler KV namespace binding to mount, e.g. `KV_CACHE`. */
  binding: string
  /** TTL applied to a write whose caller requests none. Minimum 60. */
  defaultTtl?: number
}

/**
 * The `cache` storage mount for the KV_CACHE binding.
 *
 * Nitro's route cache (`defineCachedFunction`, e.g. the llms.txt build) writes
 * through this mount with a bare `setItem`, and its error path hands every
 * rejection to `captureError`, so one hot key under a crawler sweep turned
 * each `KV PUT failed: 429` into a fresh Sentry issue per hot path. The same
 * reasoning as `writeCache` in `shared/server/cache.ts` applies at the mount
 * boundary: the value was already computed, losing the cache entry costs a
 * repeat query, while propagating the rejection costs the request its error
 * budget.
 *
 * So a rejected write resolves and reports as a `cache-write` wide event
 * instead. This is not a silent catch: a KV outage stays visible as a rise in
 * failed cache writes, and reads are untouched, so a failed read still behaves
 * as a miss.
 *
 * Every write carries a TTL of at least 60 seconds, the floor Cloudflare KV
 * enforces, matching the guarantee `@harlan-zw/nuxt-cloudflare`'s own cache
 * driver made before it was replaced here.
 */
export default defineDriver((options: KvCacheStorageOptions) => {
  const defaultTtl = options.defaultTtl ?? 30 * 24 * 60 * 60
  if (!Number.isSafeInteger(defaultTtl) || defaultTtl < MIN_TTL_SECONDS)
    throw new Error(`[kv-cache-storage] defaultTtl must be an integer of at least ${MIN_TTL_SECONDS} seconds, received ${options.defaultTtl}`)

  const driver = cloudflareKvBinding(options)
  const { setItem } = driver
  if (!setItem)
    throw new Error('[kv-cache-storage] cloudflare-kv-binding driver must implement setItem')

  return {
    ...driver,
    options,
    name: 'cloudflare-kv-cache',
    flags: { ...driver.flags, ttl: true },
    setItem(key, value, transactionOptions = {}) {
      const requestedTtl = Number(transactionOptions.ttl)
      const ttl = Number.isFinite(requestedTtl) && requestedTtl > 0
        ? Math.max(requestedTtl, MIN_TTL_SECONDS)
        : defaultTtl
      return Promise.resolve(setItem(key, value, { ...transactionOptions, ttl })).catch((error: unknown) => {
        emitOperationalEvent(createWideEvent({
          'operation': 'cache-write',
          'outcome': 'failed',
          'cache.writeFailed': true,
          'reason': error instanceof Error ? error.message : String(error),
        }))
      })
    },
  }
})
