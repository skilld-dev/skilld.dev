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
 * How long one request's claim on refreshing a key stands. A Worker keeps a
 * `waitUntil` task at most 30 seconds after its response, so a refresh that
 * still runs past its claim was cut off.
 */
export const REFRESH_CLAIM_SECONDS = 30

/** A request's claim on refreshing one stale key in this isolate. */
interface RefreshClaim {
  /** Epoch milliseconds. */
  until: number
}

/** Refresh claims by cache key, for {@link claimRefresh}. */
const refreshClaims = new Map<string, RefreshClaim>()

/**
 * Claim the refresh of a stale `key` for this request. Answers null when
 * another request in this isolate holds a claim that still stands; that
 * request serves the stale value instead of computing again.
 *
 * A bare read-through cache turns every TTL expiry into a thundering herd:
 * after the entry goes stale, each concurrent request re-runs the whole
 * compute until the first write lands, and on these routes a compute is about
 * six D1 queries plus a possible live GitHub render. The ops triage ledger
 * attributes recurring D1 overload bursts (Sentry SKILLD-G/H/J/K/M/N/P/Q) to
 * exactly that shape. One claim per key keeps a stale key to one compute and
 * one KV write per isolate, which also keeps the write under KV's
 * one-write-per-second limit.
 *
 * The claim is a finished value, never a promise. workerd ties a compute's
 * I/O to the request that started it, and drops it when that request ends.
 * A request that awaited a compute another request started would then wait
 * forever, and so would every later request on that key in the isolate. So a
 * compute stays with its own request: a cold or dead key computes in each
 * request that reads it. A claim whose request ended lapses after
 * {@link REFRESH_CLAIM_SECONDS}, and the next stale read refreshes.
 */
function claimRefresh(key: string, nowMs: number): RefreshClaim | null {
  const held = refreshClaims.get(key)
  if (held && held.until > nowMs)
    return null
  const claim = { until: nowMs + REFRESH_CLAIM_SECONDS * 1000 }
  refreshClaims.set(key, claim)
  return claim
}

function releaseRefresh(key: string, claim: RefreshClaim): void {
  if (refreshClaims.get(key) === claim)
    refreshClaims.delete(key)
}

/**
 * SWR read-through over fixed keys.
 *
 * - fresh (`age < ttlSeconds`): serve the stored value.
 * - stale (`age < ttlSeconds + staleSeconds`): serve the stored value and
 *   refresh in the background through `schedule`, unless another request in
 *   this isolate holds the refresh claim.
 * - dead or absent: recompute in this request, awaited.
 */
export function cached<T>(options: CachedOptions<T>): Promise<T> {
  const { key, compute } = options
  const freshSeconds = options.ttlSeconds
  const maxAgeSeconds = freshSeconds + (options.staleSeconds ?? 0)
  const nowSeconds = options.now ?? (() => Math.floor(Date.now() / 1000))

  async function computeAndStore(): Promise<T> {
    const value = await compute()
    await writeCache(options.storage, key, { v: value, t: nowSeconds() } satisfies SwrEntry<T>, { ttl: maxAgeSeconds })
    return value
  }

  return (async () => {
    const entry = await readCache<SwrEntry<T>>(options.storage, key)
    if (isSwrEntry<T>(entry)) {
      const now = nowSeconds()
      const age = now - entry.t
      if (age < freshSeconds)
        return entry.v
      if (age < maxAgeSeconds) {
        const claim = claimRefresh(key, now * 1000)
        if (claim) {
          const refresh = computeAndStore()
            .then(() => {}, (error: unknown) => {
              emitOperationalEvent(createWideEvent({
                'operation': 'swr-refresh',
                'outcome': 'failed',
                'cache.key': key,
                'reason': error instanceof Error ? error.message : String(error),
              }))
            })
            .finally(() => releaseRefresh(key, claim))
          if (options.schedule)
            options.schedule(refresh)
          else
            void refresh
        }
        return entry.v
      }
    }
    return computeAndStore()
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
   * Extra seconds a stale value stays readable when its recompute fails, or
   * while another request recomputes it. Defaults to `ttl`. The KV entry is
   * stored with `ttl + staleTtl`, so a value that leaves the stale window is
   * physically gone and cannot be served by accident.
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
  /**
   * Shape guard for a stored value. The KV bytes are untrusted input: an
   * entry whose value fails this guard is treated as a miss and recomputed,
   * so a corrupt or foreign payload can neither be served nor dereferenced
   * by `windowsFor`. Computed values skip the guard; `compute` already
   * returns the precise type.
   */
  validate?: (value: unknown) => boolean
}

function resolveWindows<T>(options: ReadThroughOptions<T>, value: T): ReadThroughWindows {
  return options.windowsFor?.(value)
    ?? { ttl: options.ttl, staleTtl: options.staleTtl ?? options.ttl }
}

/**
 * Read-through with a stale fallback: serve the cached value while it is
 * fresh, recompute when it is stale or missing, and serve the stale value
 * when that recompute fails. A stale read that meets another request's
 * refresh claim serves the stale value without a recompute.
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
  const stored = parseEnvelope<T>(await readCache<unknown>(storage, key))

  // A stored value that fails the shape guard is corrupt or foreign. Treat
  // the whole entry as a miss so the recompute below overwrites it, instead
  // of letting every read trip over bytes nobody can trust.
  const entry = stored && isUsableStoredValue(options, stored.value) ? stored : null
  if (stored && !entry) {
    emitOperationalEvent(createWideEvent({
      'operation': 'cache-read-through',
      'outcome': 'degraded',
      'cache.key': key,
      'reason': 'invalid-stored-value',
    }))
  }

  if (entry) {
    const windows = resolveWindows(options, entry.value)
    const ageSeconds = (now - entry.storedAt) / 1000
    if (ageSeconds < windows.ttl)
      return entry.value
    if (ageSeconds < windows.ttl + windows.staleTtl) {
      const claim = claimRefresh(key, now)
      // Another request in this isolate is recomputing this key.
      if (!claim)
        return entry.value
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
        return entry.value
      }
      finally {
        releaseRefresh(key, claim)
      }
    }
  }

  return storeComputed(storage, key, compute, options)
}

function isUsableStoredValue<T>(options: ReadThroughOptions<T>, value: unknown): boolean {
  return !options.validate || options.validate(value)
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
