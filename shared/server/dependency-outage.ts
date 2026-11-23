import type { H3Error } from 'h3'
import { createError } from 'h3'

/** The cause a dependency outage 503 carries. Sentry reads the tag, never the message. */
export interface DependencyOutage {
  _tag: 'DependencyOutage'
  /** The service that failed, such as `raw.githubusercontent.com` or `d1`. */
  dependency: string
}

export type DependencyOutageInput
  = | { dependency: string, message: string }
    | { dependency: string, statusMessage: string }

/**
 * The 503 a handler answers when a dependency it needs is down.
 *
 * Throw it only after a wide event has recorded the outage. Nitro forwards
 * every thrown 5xx to Sentry as unhandled, and the server `beforeSend` drops
 * this one by its cause, so the wide event stays the one record of the outage
 * (Sentry SKILLD-11, SKILLD-1E, SKILLD-44, SKILLD-4Z). A 503 thrown any other
 * way still reaches Sentry, because a missing binding or secret is a defect.
 *
 * The mark is structural on purpose. The filter used to match a message
 * suffix, so every new outage message that did not end the same way reached
 * Sentry as a new issue.
 */
export function dependencyOutageError(input: DependencyOutageInput): H3Error {
  const { dependency, ...message } = input
  const cause: DependencyOutage = { _tag: 'DependencyOutage', dependency }
  return createError({ statusCode: 503, ...message, cause })
}

/** Whether an error, or any error in its cause chain, is a `dependencyOutageError`. */
export function isDependencyOutageError(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current = error
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current)
    if ((current as { _tag?: unknown })._tag === 'DependencyOutage')
      return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
