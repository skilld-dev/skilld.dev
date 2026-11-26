import { defineEventHandler, getRequestURL } from 'h3'
import { isStaticProbe404Path } from '#shared/static-probe-404'

/**
 * Answer missing static asset and CMS/scanner probes with a plain-text 404
 * before Nuxt SSR runs.
 *
 * Existing files in `public/` are served by Cloudflare Static Assets before
 * the Worker executes. Any matching path that reaches Nitro is a confirmed
 * miss; serving `text/plain` with a short edge TTL cuts probe CPU from ~110 ms
 * to <1 ms and lets Cloudflare absorb repeat scanner bursts.
 */
export default defineEventHandler((event) => {
  const method = event.req?.method ?? event.method
  if (method !== 'GET' && method !== 'HEAD')
    return

  const pathname = getRequestURL(event).pathname
  if (!isStaticProbe404Path(pathname))
    return

  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex',
      'cache-control': 'no-store',
      'cloudflare-cdn-cache-control': 'public, max-age=300',
    },
  })
})
