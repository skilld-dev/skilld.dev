import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'

function deploymentId(event: H3Event): string | null {
  const id = event.context.platform?.env?.CF_VERSION_METADATA?.id
  return typeof id === 'string' && id.trim() ? id : null
}

export async function skillSearchCacheKey(event: H3Event): Promise<string> {
  const query = getRequestURL(event).searchParams
  query.sort()
  // Nitro strips punctuation from custom keys. Hash the complete identity so
  // distinct queries cannot collapse into the same storage key.
  const identity = JSON.stringify([deploymentId(event), query.toString()])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export const skillSearchCacheOptions = {
  maxAge: 60,
  staleMaxAge: 60 * 5,
  swr: true,
  group: 'skills-list',
  name: 'skills-list-v1',
  getKey: skillSearchCacheKey,
  // Without a deployment identity, shared storage cannot separate releases.
  shouldBypassCache: (event: H3Event) => deploymentId(event) === null,
}
