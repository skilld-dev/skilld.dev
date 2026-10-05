import type { H3Event } from 'h3'
import { readThroughCache } from '#shared/server/cache'

/** Keep each feed's last good answer through a bounded D1 outage. */
export async function cachedFeed<T>(event: H3Event, namespace: string, compute: () => Promise<T>, query: number[] = []): Promise<T> {
  const deployment = event.context.platform?.env?.CF_VERSION_METADATA?.id
  // A deployment identifies the response schema. Never reuse another release's
  // answer, and bypass shared storage when that identity is unavailable.
  if (typeof deployment !== 'string' || !deployment.trim())
    return compute()

  const identity = JSON.stringify([deployment, namespace, query])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  const key = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  const value = await readThroughCache(useStorage('edge-cache'), `feed:v1:${key}`, compute, {
    ttl: 300,
    staleTtl: 3600,
  })
  // Preserve the feed routes' existing browser freshness window.
  setHeader(event, 'Cache-Control', 'max-age=300')
  return value
}
