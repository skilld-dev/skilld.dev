import type { H3Event } from 'h3'

/**
 * Keep `promise` alive past the response on Workers.
 *
 * This is the `schedule` argument a stale-while-revalidate {@link cached} read
 * needs, so a background refresh is not cut off when the response returns.
 * Off Workers (local dev, tests) it does not block the response.
 */
export function runAfterResponse(event: H3Event, promise: Promise<unknown>): void {
  const ctx = (event.context as { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } }).cloudflare?.context
  if (ctx?.waitUntil) {
    ctx.waitUntil(promise)
    return
  }
  void promise
}
