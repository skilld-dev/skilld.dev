/**
 * The write half of unstorage's `Storage`, structurally typed so this module
 * does not depend on unstorage's own types being resolvable.
 */
interface CacheStorage {
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
interface CacheReadStorage {
  getItem: <T>(key: string) => Promise<T | null>
}

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
