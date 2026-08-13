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
