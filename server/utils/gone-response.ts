import type { H3Event } from 'h3'

/**
 * Return a plain-text 410 Gone response without entering Nuxt error SSR.
 *
 * Throwing `createError({ statusCode: 410 })` from middleware renders `/__nuxt_error`
 * through Vue SSR (~125 ms Worker CPU per hit). For permanently retired URL
 * namespaces, a plain-text 410 with `X-Robots-Tag: noindex` and a short edge
 * cache TTL lets search engines drop the URLs while Cloudflare absorbs repeat
 * crawler bursts.
 *
 * Because `content-type` is `text/plain` (not HTML) and `cache-control` is
 * stated, `@harlan-zw/nuxt-cloudflare`'s `workers-cache` plugin leaves
 * `cloudflare-cdn-cache-control` intact.
 */
export function createGoneResponse(event: H3Event, message = 'Gone'): Response {
  const method = event.req?.method ?? event.method
  const isCacheableMethod = method === 'GET' || method === 'HEAD'
  return new Response(method === 'HEAD' ? null : message, {
    status: 410,
    statusText: 'Gone',
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex',
      'cache-control': 'no-store',
      'cloudflare-cdn-cache-control': isCacheableMethod ? 'public, max-age=300' : 'no-store',
    },
  })
}
