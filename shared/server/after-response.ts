import type { H3Event } from 'h3'

type WaitUntil = (promise: Promise<unknown>) => void

interface EventWithRuntimeWaitUntil {
  req?: { waitUntil?: WaitUntil }
  runtime?: { cloudflare?: { context?: { waitUntil?: WaitUntil } } }
}

/**
 * Resolve the runtime's `waitUntil` callback for an H3 request event, or `null`
 * when the runtime cannot extend a request past its response.
 *
 * Nitro 3 mounts `waitUntil` onto `event.req.waitUntil` and exposes Cloudflare's
 * ExecutionContext at `event.runtime.cloudflare.context`. It never populates
 * Nitro 2's `event.context.cloudflare`. H3's `event.waitUntil()` delegates to
 * `event.req.waitUntil?.()`, which silently no-ops off Workers, so callers that
 * need to know whether the runtime accepted the work resolve the underlying
 * function here first.
 */
export function resolveAfterResponse(event: H3Event): WaitUntil | null {
  const candidate = event as unknown as EventWithRuntimeWaitUntil
  if (typeof candidate.req?.waitUntil === 'function')
    return promise => candidate.req!.waitUntil!(promise)
  const runtimeContext = candidate.runtime?.cloudflare?.context
  if (typeof runtimeContext?.waitUntil === 'function')
    return promise => runtimeContext.waitUntil!(promise)
  return null
}

/**
 * Keep `promise` alive past the response on Workers.
 *
 * Returns `true` when the runtime registered the promise with `waitUntil`, and
 * `false` off Workers (local dev, Node unit tests, or unaugmented requests) so
 * callers can decide whether to await or fall back instead of dropping work.
 */
export function runAfterResponse(event: H3Event, promise: Promise<unknown>): boolean {
  const waitUntil = resolveAfterResponse(event)
  if (waitUntil) {
    waitUntil(promise)
    return true
  }
  void promise
  return false
}
