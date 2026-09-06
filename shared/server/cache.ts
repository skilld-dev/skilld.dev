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

export interface ReadThroughOptions {
  /** Seconds a stored value stays fresh and is served without a recompute. */
  ttl: number
  /**
   * Extra seconds a stale value stays readable when its recompute fails.
   * Defaults to `ttl`. The KV entry is stored with `ttl + staleTtl`, so a
   * value that leaves the stale window is physically gone and cannot be
   * served by accident.
   */
  staleTtl?: number
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
  options: ReadThroughOptions,
): Promise<T> {
  const { ttl, staleTtl = ttl } = options
  const now = Date.now()
  const envelope = parseEnvelope<T>(await readCache<unknown>(storage, key))

  if (envelope) {
    const ageSeconds = (now - envelope.storedAt) / 1000
    if (ageSeconds < ttl)
      return envelope.value
    if (ageSeconds < ttl + staleTtl) {
      try {
        return await storeComputed(storage, key, compute, ttl + staleTtl)
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

  return storeComputed(storage, key, compute, ttl + staleTtl)
}

async function storeComputed<T>(
  storage: ReadThroughCache,
  key: string,
  compute: () => Promise<T>,
  storageTtl: number,
): Promise<T> {
  const value = await compute()
  await writeCache(storage, key, { storedAt: Date.now(), value } satisfies CacheEnvelope<T>, { ttl: storageTtl })
  return value
}
