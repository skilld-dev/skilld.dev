/**
 * The related-skills response is cached whole, and keyed by the request slug.
 *
 * Every uncached request costs roughly six D1 reads: skill, source identity,
 * same-repo and same-owner relations, co-occurrence, and neighbor hydration.
 * On 2026-08-04 one hot
 * skill produced 839 `D1 DB is overloaded` errors in a single hour while 879
 * skills were being ingested. Related skills only change when the registry does,
 * so an hour of staleness is cheap next to that.
 *
 * An earlier fallback ran a full FTS/BM25 search for every cold skill without
 * Vectorize neighbors. Production insights measured 6,090 executions at 64 ms
 * average, so crawler sweeps saturated D1 before this cache could warm. The
 * response already carries same-repo, same-owner, and co-occurrence results;
 * semantic siblings now stay empty until Vectorize has evidence.
 *
 * The key is the slug because the lookup that turns a slug into a Skill is
 * itself one or two D1 reads, and it used to run ahead of the cache on every
 * request. A crawler walking 14,100 Skill pages therefore paid that read
 * 14,100 times an hour no matter how warm the cache was. On 2026-09-22 that
 * floor saturated D1 again and starved artifact delivery, which shares the
 * database: 100 resolutions failed `SERVICE_UNAVAILABLE` after burning a full
 * 15-minute retry budget against an overloaded D1. Keying on the slug puts the
 * lookup behind the cache, so a hit costs no D1 read at all.
 */
export const RELATED_CACHE_TTL = 60 * 60
/**
 * How long past its fresh window a related-skills response stays servable
 * when its live recompute fails. Related skills only change when the registry
 * does, so during a D1 overload (Sentry SKILLD-1F) serving a day-old response
 * beats 500ing the endpoint.
 */
export const RELATED_CACHE_STALE_TTL = 60 * 60 * 24
/**
 * How long a slug that resolved to no Skill stays cached.
 *
 * A crawler sweep over dead slugs used to cost two D1 reads each and cache
 * nothing, so the cheapest request on the site was also the one that repeated
 * forever. This window is short because a Skill that appears in the registry
 * should become visible in minutes, not in an hour.
 */
export const RELATED_MISSING_TTL = 10 * 60
/** Missing entries are cheap to recompute, so they carry no stale window. */
export const RELATED_MISSING_STALE_TTL = 0
// v4: entries are keyed by request slug and carry a `_tag`, so v3 values
// (keyed by resolved identity, untagged) must never be read as v4 entries.
const RELATED_CACHE_VERSION = 'v4'

/**
 * A cached related-skills lookup. `missing` is a real, cacheable answer, not
 * an error: it says this slug resolved to no Skill, which is the single most
 * common thing a crawler asks for.
 */
export type CachedRelated<T>
  = | { _tag: 'found', response: T }
    | { _tag: 'missing' }

export function relatedCacheKey(slug: string): string {
  return `skills:related:${RELATED_CACHE_VERSION}:${slug}`
}

/**
 * Freshness per variant. A resolved response rides the long registry window;
 * a missing one rechecks soon, so a newly indexed Skill is not hidden for an
 * hour by the miss that preceded it.
 */
export function relatedCacheWindows<T>(
  value: CachedRelated<T>,
): { ttl: number, staleTtl: number } {
  return value._tag === 'missing'
    ? { ttl: RELATED_MISSING_TTL, staleTtl: RELATED_MISSING_STALE_TTL }
    : { ttl: RELATED_CACHE_TTL, staleTtl: RELATED_CACHE_STALE_TTL }
}

/**
 * Shape guard for KV bytes. A v3 value is an untagged raw response, so it
 * fails here and is recomputed rather than served as an envelope.
 */
export function isCachedRelated(value: unknown): value is CachedRelated<unknown> {
  if (typeof value !== 'object' || value === null)
    return false
  const tag = (value as { _tag?: unknown })._tag
  if (tag === 'missing')
    return true
  return tag === 'found' && 'response' in value
}
