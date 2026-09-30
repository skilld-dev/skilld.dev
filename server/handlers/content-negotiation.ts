import { AI_READY_INTERNAL_HEADER, decideNegotiation, NEGOTIATION_VARY } from '#shared/content-negotiation'

/**
 * Send a page request that asks for Markdown to the page's `.md` URL.
 *
 * Replaces nuxt-ai-ready's negotiation (off in `nuxt.config.ts`), which also
 * read User-Agent. Both answers name the same `Vary`, so a shared cache stores
 * the HTML under the headers that chose it and misses for a request that would
 * have been redirected.
 */
export default defineEventHandler((event) => {
  const decision = decideNegotiation({
    method: event.method,
    path: event.path,
    accept: getRequestHeader(event, 'accept'),
    secFetchDest: getRequestHeader(event, 'sec-fetch-dest'),
    internal: Boolean(getRequestHeader(event, AI_READY_INTERNAL_HEADER) || getRequestHeader(event, 'x-nitro-prerender')),
  })
  if (decision._tag === 'skip')
    return

  appendResponseHeader(event, 'vary', NEGOTIATION_VARY)
  if (decision._tag === 'html')
    return

  setResponseHeader(event, 'cache-control', 'private, no-store')
  setResponseHeader(event, 'cloudflare-cdn-cache-control', 'no-store')
  if (decision._tag === 'not-acceptable') {
    throw createError({
      statusCode: 406,
      statusMessage: 'Not Acceptable',
      message: 'Supported types: text/html, text/markdown, text/plain',
    })
  }
  return sendRedirect(event, decision.location, 307)
})
