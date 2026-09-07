/**
 * The write half of unstorage's `Storage`, structurally typed so this module
 * does not depend on unstorage's own types being resolvable.
 */
export interface CacheStorage {
  setItem: (key: string, value: never, options?: { ttl?: number }) => Promise<void>
}

/**
 * Write to the KV-backed cache without letting the write decide whether the
 * request succeeds. Workers KV allows one write per second per key, so a read-
 * through cache on a hot fixed key (skill duplicate candidates, the endorsement
 * map) rate limits under concurrency and rejects with
 * `KV PUT failed: 429 Too Many Requests` (Sentry SKILLD-C). The value was
 * already computed by the time we get here; losing the cache entry costs a
 * repeat query, while propagating the rejection costs the user the page.
 */
export async function writeCache<T>(
  storage: CacheStorage,
  key: string,
  value: T,
  options?: { ttl?: number },
): Promise<void> {
  try {
    await storage.setItem(key, value as never, options)
  }
  catch {
    emitOperationalEvent(createWideEvent({ 'operation': 'cache-write', 'outcome': 'failed', 'cache.writeFailed': true }))
  }
}

/**
 * What {@link cached} stores for one key: the computed value plus the epoch
 * seconds it was computed at. Freshness is decided from `t`, so the storage
 * TTL only has to carry the entry through the whole fresh + stale window.
 */
interface SwrEntry<T> {
  v: T
  t: number
}

function isSwrEntry<T>(value: unknown): value is SwrEntry<T> {
  return typeof value === 'object' && value !== null
    && 'v' in value && 't' in value
    && typeof (value as SwrEntry<T>).t === 'number'
}

export interface CachedOptions<T> {
  storage: ReadThroughCache
  key: string
  /** Seconds a stored value is served as-is. */
  ttlSeconds: number
  /** Extra seconds a stale value is served while one refresh recomputes. Zero means the entry is dead at TTL expiry. */
  staleSeconds?: number
  /** The full computation a cache miss must run. */
  compute: () => Promise<T>
  /**
   * Runs the background refresh promise when a stale value is served.
   * Pass the event's `waitUntil` wrapper so Workers keeps the refresh alive;
   * the default drops it to fire-and-forget.
   */
  schedule?: (promise: Promise<unknown>) => void
  /** Epoch seconds clock. */
  now?: () => number
}

/**
 * One in-flight computation per cache key.
 *
 * A bare read-through cache turns every TTL expiry into a thundering herd:
 * after the entry dies, each concurrent request re-runs the whole compute
 * until the first write lands, and on these routes a compute is about six D1
 * queries plus a possible live GitHub render. The ops triage ledger
 * attributes recurring D1 overload bursts (Sentry SKILLD-G/H/J/K/M/N/P/Q) to
 * exactly that shape, and Nitro's `defineCachedEventHandler` had the same
 * hole covered by `swr: true` + `staleMaxAge` before the detail route left it
 * (Sentry SKILLD-1V). This helper restores both halves without the bare
 * `setItem` that made a KV 429 a 500:
 *
 * - fresh (`age < ttlSeconds`): serve the stored value.
 * - stale (`age < ttlSeconds + staleSeconds`): serve the stored value and
 *   refresh in the background through `schedule`.
 * - dead or absent: recompute, awaited.
 *
 * All three paths funnel into one shared promise per key, so concurrent
 * callers share a single computation, a single D1 pass, and a single KV
 * write, which also keeps the write under KV's one-write-per-second limit.
 * The map is per isolate, so the guarantee is per isolate; that is still the
 * difference between N computes and one.
 */
const inflightComputes = new Map<string, Promise<unknown>>()

export function cached<T>(options: CachedOptions<T>): Promise<T> {
  const { key, compute } = options
  const freshSeconds = options.ttlSeconds
  const maxAgeSeconds = freshSeconds + (options.staleSeconds ?? 0)
  const nowSeconds = options.now ?? (() => Math.floor(Date.now() / 1000))

  function computeOnce(): Promise<T> {
    const pending = inflightComputes.get(key)
    if (pending)
      return pending as Promise<T>
    const promise = (async () => {
      const value = await compute()
      await writeCache(options.storage, key, { v: value, t: nowSeconds() } satisfies SwrEntry<T>, { ttl: maxAgeSeconds })
      return value
    })()
    inflightComputes.set(key, promise)
    // Both callbacks return normally, so this derived promise never rejects
    // and the original rejection still reaches every caller.
    void promise.then(() => inflightComputes.delete(key), () => inflightComputes.delete(key))
    return promise
  }

  return (async () => {
    const entry = await readCache<SwrEntry<T>>(options.storage, key)
    if (isSwrEntry<T>(entry)) {
      const age = nowSeconds() - entry.t
      if (age < freshSeconds)
        return entry.v
      if (age < maxAgeSeconds) {
        const refresh = computeOnce().catch((error: unknown) => {
          emitOperationalEvent(createWideEvent({
            'operation': 'swr-refresh',
            'outcome': 'failed',
            'cache.key': key,
            'reason': error instanceof Error ? error.message : String(error),
          }))
        })
        if (options.schedule)
          options.schedule(refresh)
        else
          void refresh
        return entry.v
      }
    }
    return computeOnce()
  })()
}

/**
 * The read half of unstorage's `Storage`, structurally typed for the same
 * reason as {@link CacheStorage}.
 */
export interface CacheReadStorage {
  getItem: <T>(key: string) => Promise<T | null>
}

/** A cache a read-through helper both reads and writes. */
export type ReadThroughCache = CacheReadStorage & CacheStorage

/**
 * Read from the KV-backed cache without letting the read decide whether the
 * request succeeds.
 *
 * `writeCache` already holds this line for KV writes (Sentry SKILLD-C). The
 * read side was left bare, and it fails the same way: Workers KV answered a
 * `getItem` with `KV GET failed: 500 Internal Server Error` and the rejection
 * travelled out of a read-through cache and 500'd the page (Sentry SKILLD-S,
 * `GET /api/skill-related/…`, first seen 2026-08-09, still live 2026-08-18).
 *
 * A read-through cache has an answer for a failed read, and it is the same
 * answer it has for a miss: compute the value. Treating the rejection as a miss
 * costs one repeat query. Propagating it costs the user the page.
 *
 * This is deliberately not a silent catch. The miss is the correct behaviour,
 * and the wide event carries the reason so a KV outage is still visible as a
 * collapse in hit rate rather than as nothing at all.
 */
export async function readCache<T>(
  storage: CacheReadStorage,
  key: string,
): Promise<T | null> {
  try {
    return await storage.getItem<T>(key)
  }
  catch (error) {
    emitOperationalEvent(createWideEvent({
      'operation': 'cache-read',
      'outcome': 'failed',
      'cache.readFailed': true,
      'reason': error instanceof Error ? error.message : String(error),
    }))
    return null
  }
}
