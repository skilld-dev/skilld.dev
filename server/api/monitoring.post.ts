import { parseSentryTunnelEnvelope } from '#shared/sentry'

/** Browser error envelopes are small. Anything larger is not ours. */
const MAX_ENVELOPE_BYTES = 512 * 1024

/**
 * Same-origin Sentry tunnel.
 *
 * The browser SDK posts envelopes here instead of to sentry.io, so Sentry sees
 * the Worker, never the visitor. The request is rebuilt with only a content
 * type: no client IP, forwarded-for, cookie, or user agent header is copied.
 * Only envelopes for the configured DSN are forwarded.
 */
export default defineEventHandler(async (event) => {
  const { sentry } = useRuntimeConfig(event)
  if (!sentry.enabled || !sentry.dsn)
    throw createError({ statusCode: 404 })

  const body = await readRawBody(event, 'utf8')
  if (!body || body.length > MAX_ENVELOPE_BYTES)
    throw createError({ statusCode: 413, message: 'Envelope is empty or too large.' })

  const target = parseSentryTunnelEnvelope(body, sentry.dsn)
  if (target._tag === 'reject')
    throw createError({ statusCode: 400, message: `Envelope rejected: ${target.reason}.` })

  const response = await fetch(target.url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope' },
    body,
  })
  setResponseStatus(event, response.status)
  return null
})
