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

/**
 * What a read-through helper stores: the value plus the moment it was
 * computed, so a later read can tell a fresh entry from a stale one. The KV
 * TTL alone cannot, because an entry that expired is an entry that is gone.
 */
interface CacheEnvelope<T> {
  storedAt: number
  value: T
}

function parseEnvelope<T>(raw: unknown): CacheEnvelope<T> | null {
  if (typeof raw !== 'object' || raw === null || !('storedAt' in raw) || !('value' in raw))
    return null
  const { storedAt, value } = raw as Record<string, unknown>
  if (typeof storedAt !== 'number' || !Number.isFinite(storedAt))
    return null
  return { storedAt, value: value as T }
}

export interface ReadThroughWindows {
  /** Seconds the value stays fresh and is served without a recompute. */
  ttl: number
  /** Extra seconds a stale value stays readable when its recompute fails. */
  staleTtl: number
}

export interface ReadThroughOptions<T = unknown> {
  /** Seconds a stored value stays fresh and is served without a recompute. */
  ttl: number
  /**
   * Extra seconds a stale value stays readable when its recompute fails.
   * Defaults to `ttl`. The KV entry is stored with `ttl + staleTtl`, so a
   * value that leaves the stale window is physically gone and cannot be
   * served by accident.
   */
  staleTtl?: number
  /**
   * Fresh and stale windows for one specific value, overriding `ttl` and
   * `staleTtl`. Read for the stored value decides whether an entry is still
   * fresh; read for the computed value decides the KV entry TTL. Use this
   * for values whose freshness differs from the norm, e.g. a transient
   * empty payload that must recheck on a short missing window instead of
   * riding the resolved payload's fresh window.
   */
  windowsFor?: (value: T) => ReadThroughWindows | undefined
}

function resolveWindows<T>(options: ReadThroughOptions<T>, value: T): ReadThroughWindows {
  return options.windowsFor?.(value)
    ?? { ttl: options.ttl, staleTtl: options.staleTtl ?? options.ttl }
}

/**
 * Read-through with a stale fallback: serve the cached value while it is
 * fresh, recompute when it is stale or missing, and serve the stale value
 * when that recompute fails.
 *
 * `readCache` already treats a failed read as a miss (Sentry SKILLD-S). The
 * remaining gap is the recompute behind the miss: when the cached entry
 * expires during a D1 overload, the live recompute rejects and the request
 * 500s even though a last good response sat in KV seconds earlier (Sentry
 * SKILLD-1F, 202 events on `GET /api/skill-related/…`). The value that
 * expired was computed against the same data; serving it for one more
 * window is strictly better than serving an error page.
 *
 * This is not a silent catch: the wide event carries the reason and the age
 * of the served value, so a dependency outage shows up as a collapse in
 * freshness rather than as a collapse in availability.
 */
export async function readThroughCache<T>(
  storage: ReadThroughCache,
  key: string,
  compute: () => Promise<T>,
  options: ReadThroughOptions<T>,
): Promise<T> {
  const now = Date.now()
  const envelope = parseEnvelope<T>(await readCache<unknown>(storage, key))

  if (envelope) {
    const windows = resolveWindows(options, envelope.value)
    const ageSeconds = (now - envelope.storedAt) / 1000
    if (ageSeconds < windows.ttl)
      return envelope.value
    if (ageSeconds < windows.ttl + windows.staleTtl) {
      try {
        return await storeComputed(storage, key, compute, options)
      }
      catch (error) {
        emitOperationalEvent(createWideEvent({
          'operation': 'cache-read-through',
          'outcome': 'degraded',
          'cache.servedStale': true,
          'cache.ageSeconds': Math.round(ageSeconds),
          'reason': error instanceof Error ? error.message : String(error),
        }))
        return envelope.value
      }
    }
  }

  return storeComputed(storage, key, compute, options)
}

async function storeComputed<T>(
  storage: ReadThroughCache,
  key: string,
  compute: () => Promise<T>,
  options: ReadThroughOptions<T>,
): Promise<T> {
  const value = await compute()
  const windows = resolveWindows(options, value)
  await writeCache(storage, key, { storedAt: Date.now(), value } satisfies CacheEnvelope<T>, { ttl: windows.ttl + windows.staleTtl })
  return value
}
