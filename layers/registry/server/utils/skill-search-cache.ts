import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'
import { cached } from '#shared/server/cache'
import { runAfterResponse } from './after-response'

function deploymentId(event: H3Event): string | null {
  const id = event.context.platform?.env?.CF_VERSION_METADATA?.id
  return typeof id === 'string' && id.trim() ? id : null
}

export async function skillSearchCacheKey(event: H3Event): Promise<string> {
  const query = getRequestURL(event).searchParams
  query.sort()
  // Hash the complete identity so distinct queries cannot collapse into the
  // same storage key and the key stays a bounded, opaque string.
  const identity = JSON.stringify([deploymentId(event), query.toString()])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const SEARCH_CACHE_TTL = 60
const SEARCH_CACHE_STALE_TTL = 60 * 5

/**
 * The `/api/skills` search cache: the query-string identity from
 * {@link skillSearchCacheKey} behind the shared SWR {@link cached} shield.
 *
 * This was the last registry route still on Nitro's `defineCachedEventHandler`
 * (Sentry SKILLD-28): whether a failed KV read reaches the request depends on
 * which catch Nitro's own cache layer happens to ship, and every failure is
 * still reported as a captured error. The detail route (#146) and skill-files
 * (#201) already moved to `cached`: a failed KV read is a miss, a failed write
 * is a dropped cache entry, neither reaches the request, and both report as
 * wide events.
 */
export async function cachedSkillsSearch<T>(
  event: H3Event,
  compute: () => Promise<T>,
  /**
   * The key hashes the query string only, not the path. Two routes that answer
   * one query string in different shapes need their own namespace.
   */
  namespace = 'skills-list:v2',
): Promise<T> {
  // Without a deployment identity, shared storage cannot separate releases.
  if (deploymentId(event) === null)
    return compute()
  return cached({
    storage: useStorage('edge-cache'),
    key: `${namespace}:${await skillSearchCacheKey(event)}`,
    ttlSeconds: SEARCH_CACHE_TTL,
    staleSeconds: SEARCH_CACHE_STALE_TTL,
    compute,
    schedule: promise => runAfterResponse(event, promise),
  })
}
