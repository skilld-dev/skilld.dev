import type { H3Event } from 'h3'
import type { UserSession } from './handler'
import { defineEventHandler, getHeader, setHeader, setResponseStatus } from 'h3'
import { problemSchema, problemType, SKILLD_V1_ERROR_TITLES } from 'skilld-sdk/contract'

export type ApiV1Identity
  = | { _tag: 'guest' }
    | { _tag: 'account', user: UserSession['user'] }

declare module 'h3' {
  interface H3EventContext {
    apiV1Identity?: ApiV1Identity
  }
}

/**
 * One allowance across v1 operations, keyed by verified account or Cloudflare's client IP.
 * Resolution polls draw from a separate allowance under the same key.
 */
export function createApiRateLimitHandler(resolveUser: (event: H3Event) => Promise<UserSession['user'] | null>) {
  return defineEventHandler(async (event) => {
    const path = event.path.split('?')[0]!
    if (!(path === '/api/v1' || path.startsWith('/api/v1/')) || event.method === 'OPTIONS')
      return

    // Workers Cache otherwise answers before this middleware, skipping its counter.
    // Browser caching and the backing registry/feed caches remain available.
    setHeader(event, 'cloudflare-cdn-cache-control', 'no-store')
    const user = getHeader(event, 'authorization') || getHeader(event, 'cookie')
      ? await resolveUser(event)
      : null
    event.context.apiV1Identity = user ? { _tag: 'account', user } : { _tag: 'guest' }
    const { env, requestId } = event.context.platform
    // Do not trust X-Forwarded-For. Missing Cloudflare identity shares a conservative bucket.
    const key = user ? `account:${user.id}` : `guest:${getHeader(event, 'cf-connecting-ip') ?? 'unknown'}`
    const limiter = isResolutionPoll(event.method, path)
      ? env.API_RESOLUTION_POLL_RATE_LIMIT
      : user ? env.API_ACCOUNT_RATE_LIMIT : env.API_GUEST_RATE_LIMIT
    const { success } = await limiter.limit({ key })
    if (success)
      return

    setResponseStatus(event, 429)
    setHeader(event, 'content-type', 'application/problem+json')
    setHeader(event, 'cache-control', 'private, no-store')
    setHeader(event, 'retry-after', 60)
    setHeader(event, 'x-request-id', requestId)
    setHeader(event, 'access-control-allow-origin', '*')
    setHeader(event, 'access-control-expose-headers', 'Retry-After, X-Request-Id')
    return problemSchema.producer.parse({
      type: problemType('RATE_LIMITED'),
      title: SKILLD_V1_ERROR_TITLES.RATE_LIMITED,
      status: 429,
      code: 'RATE_LIMITED',
      detail: 'Request limit reached. Wait 60 seconds, then retry.',
      instance: event.path,
    })
  })
}

const RESOLUTION_POLL_PATH = /^\/api\/v1\/resolutions\/[^/]+$/

/**
 * A read of one Resolution while its build runs.
 *
 * The server sets the poll rate through `pollAfterMs`, so a poll is not a
 * request the caller chose to make. A one-minute build costs sixty polls,
 * which used to spend the whole guest allowance (ADR-0012).
 */
function isResolutionPoll(method: string, path: string): boolean {
  return method === 'GET' && RESOLUTION_POLL_PATH.test(path)
}
