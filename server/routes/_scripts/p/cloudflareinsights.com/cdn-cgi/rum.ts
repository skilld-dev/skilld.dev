import { scrubRumBeaconBody } from '#shared/rum-beacon'

/**
 * Forward the Cloudflare Web Analytics beacon to its real endpoint.
 *
 * `@nuxt/scripts` bundles the beacon and rewrites its report URL to this proxy
 * path, but registers no handler for it, so every report answered 404: 108 on
 * 2026-08-19. Zone-level RUM injection was carrying the numbers alone.
 */
const RUM_ENDPOINT = 'https://cloudflareinsights.com/cdn-cgi/rum'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const rawBody = isMethod(event, 'POST') ? await readRawBody(event, 'utf8') : undefined
  // Only the content type goes upstream. No IP, forwarded-for, cookie, or
  // referer header is copied, and page URLs in the body lose their query.
  const scrubbed = rawBody ? scrubRumBeaconBody(rawBody) : undefined
  if (scrubbed?._tag === 'drop') {
    emitOperationalEvent(createWideEvent({ operation: 'rum-beacon-proxy', outcome: 'failed', reason: scrubbed.reason }))
    setResponseStatus(event, 204)
    return null
  }
  const body = scrubbed?.body
  const response = await $fetch.raw(`${RUM_ENDPOINT}${url.search}`, {
    method: event.method,
    body,
    headers: { 'content-type': getHeader(event, 'content-type') ?? 'application/json' },
  }).catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'rum-beacon-proxy', outcome: 'failed' }))
    return null
  })
  // A dropped analytics beacon must never surface to the visitor as an error.
  setResponseStatus(event, response?.status ?? 204)
  return response?._data ?? null
})
