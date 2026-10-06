import type { Policy } from '#shared/server/handler'
import { createHash, timingSafeEqual } from 'node:crypto'
import { getHeader } from 'h3'

/**
 * The request carries the skill-harness Worker's `NUXT_SKILLGEN_TOKEN`.
 * Digests compare in constant time, so the check leaks nothing through timing.
 */
export const skillgenService: Policy<any> = ({ event }) => {
  const secret = useRuntimeConfig(event).skillgenToken
  const authorization = getHeader(event, 'authorization')
  if (!authorization?.startsWith('Bearer ') || typeof secret !== 'string' || !secret)
    return false
  const provided = createHash('sha256').update(authorization.slice(7)).digest()
  const expected = createHash('sha256').update(secret).digest()
  return timingSafeEqual(provided, expected)
}
