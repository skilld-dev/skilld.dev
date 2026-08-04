// Digest email click-through redirect. Every non-unsubscribe link in a
// digest is rewritten to this route with an HMAC-signed token carrying the
// destination, so URLs are not enumerable and the destination cannot be
// swapped (no open-redirect surface: only signed destinations redirect).
// Invalid or expired tokens fall back to the homepage rather than erroring.
import { defineApiHandler } from '#shared/server/handler'
import { linkKeyForUrl, recordDigestEvent, verifyDigestEventToken } from '../../utils/digest-tracking'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const config = useRuntimeConfig(event)
    const siteUrl = (config.publicSiteUrl as string) || 'https://skilld.dev'
    const token = getQuery(event).t
    const payload = typeof token === 'string'
      ? await verifyDigestEventToken(token, config.tokenKey as string)
      : null
    if (!payload || payload.e !== 'click' || !payload.u)
      return sendRedirect(event, siteUrl, 302)

    await recordDigestEvent(platform.db, {
      runId: payload.r,
      event: 'click',
      linkKey: linkKeyForUrl(payload.u),
      url: payload.u,
      occurredAt: Math.floor(Date.now() / 1000),
    }).catch((error) => {
      console.warn(`[digest-click] event write failed: ${error instanceof Error ? error.message : String(error)}`)
    })
    return sendRedirect(event, payload.u, 302)
  },
})
