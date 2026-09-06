/**
 * The related-skills response is cached whole, not just its commits.
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
 */
export const RELATED_CACHE_TTL = 60 * 60
/**
 * How long past its fresh window a related-skills response stays servable
 * when its live recompute fails. Related skills only change when the registry
 * does, so during a D1 overload (Sentry SKILLD-1F) serving a day-old response
 * beats 500ing the endpoint.
 */
export const RELATED_CACHE_STALE_TTL = 60 * 60 * 24
// v3: entries carry a freshness envelope for readThroughCache, so v2 values
// (raw responses) must never be read as envelopes.
const RELATED_CACHE_VERSION = 'v3'

export function relatedCacheKey(
  skill: { owner: string, repo: string, name: string },
): string {
  return `skills:related:${RELATED_CACHE_VERSION}:${skill.owner}/${skill.repo}/${skill.name}`
}
