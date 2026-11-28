import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { getQuery, getRequestURL, getRouterParam } from 'h3'
import { fetchProxiedImage, imageProxyResponse, parseImageProxyRequest, resolveImageProxyKey, verifyImageProxySignature } from '#server/utils/image-proxy'
import { emitOperationalEvent } from '#server/utils/operational-event'
import { resolveAfterResponse } from '#shared/server/after-response'

function defaultCache(): Cache | null {
  // The Cache API exists on Cloudflare Workers only; local Node dev has none.
  return typeof caches !== 'undefined' && 'default' in caches ? (caches as unknown as { default: Cache }).default : null
}

export default defineEventHandler(async (event) => {
  const parsed = parseImageProxyRequest(getRouterParam(event, 'kind'), getQuery(event))
  if (parsed._tag !== 'Ok')
    return imageProxyResponse(parsed)
  const { request } = parsed

  const cache = defaultCache()
  const cacheKey = new Request(getRequestURL(event).href, { method: 'GET' })
  const hit = await cache?.match(cacheKey)
  if (hit)
    return hit

  if (request._tag === 'signed') {
    const key = await resolveImageProxyKey(event.context.platform?.env)
    if (!key || !await verifyImageProxySignature(key, request.target, request.signature))
      return imageProxyResponse({ _tag: 'NotFound', reason: 'bad-signature' })
  }

  const result = await fetchProxiedImage(request, fetch).catch((error: unknown) => {
    emitOperationalEvent(createWideEvent({
      operation: 'image-proxy-fetch',
      outcome: 'failed',
      reason: `${request.target.hostname}: ${error instanceof Error ? error.message : String(error)}`,
    }))
    return { _tag: 'UpstreamFailed', status: 0 } as const
  })
  if (result._tag === 'UpstreamFailed' || result._tag === 'UnsupportedType' || result._tag === 'TooLarge') {
    emitOperationalEvent(createWideEvent({
      'operation': 'image-proxy-fetch',
      'outcome': result._tag,
      'reason': request.target.hostname,
      'upstream.status': result._tag === 'UpstreamFailed' ? result.status : 0,
    }), 'info')
  }

  const response = imageProxyResponse(result)
  const waitUntil = resolveAfterResponse(event)
  if (cache && waitUntil && (result._tag === 'Ok' || result._tag === 'AvatarFallback'))
    waitUntil(cache.put(cacheKey, response.clone()))
  return response
})
