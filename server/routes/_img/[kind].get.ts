import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { getQuery, getRequestURL, getRouterParam } from 'h3'
import { fetchProxiedImage, imageProxyResponse, parseImageProxyRequest, resolveImageProxyKey, verifyImageProxySignature } from '#server/utils/image-proxy'
import { emitOperationalEvent } from '#server/utils/operational-event'

interface WorkerContext {
  waitUntil: (promise: Promise<unknown>) => void
}

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
  const ctx = (event.context as { cloudflare?: { context?: WorkerContext } }).cloudflare?.context
  if (cache && ctx && result._tag === 'Ok')
    ctx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
})
