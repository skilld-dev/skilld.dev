// Digest email open-tracking pixel. Always answers with a 1x1 transparent
// GIF and never a non-2xx status — an invalid, expired, or missing token
// silently no-ops rather than leaking token validity to whatever fetched the
// image (mail client prefetchers, scanners, the recipient themselves).
// Design ported from nuxtseo.com's notifications module open.get route.
import { defineApiHandler } from '#shared/server/handler'
import { recordDigestEvent, verifyDigestEventToken } from '../../utils/digest-tracking'

// Smallest valid transparent GIF (1x1, single transparent pixel).
const TRANSPARENT_GIF = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='),
  char => char.charCodeAt(0),
)

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    setHeader(event, 'content-type', 'image/gif')
    setHeader(event, 'cache-control', 'no-store')

    const config = useRuntimeConfig(event)
    const token = getQuery(event).t
    const payload = typeof token === 'string'
      ? await verifyDigestEventToken(token, config.tokenKey as string)
      : null
    if (payload?.e === 'open') {
      await recordDigestEvent(platform.db, {
        runId: payload.r,
        event: 'open',
        occurredAt: Math.floor(Date.now() / 1000),
      }).catch((error) => {
        console.warn(`[digest-open] event write failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
    return TRANSPARENT_GIF
  },
})
