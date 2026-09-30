import type { H3Event } from 'h3'
import type { UserSession } from './handler'
import { getRequestHeader } from 'h3'

/**
 * The session cookie name. `nuxt.config.ts` passes it to nuxt-auth-utils, so
 * this constant and the cookie the module writes cannot drift apart.
 */
export const SESSION_NAME = 'nuxt-session'

/** h3 also accepts the sealed session in this header instead of the cookie. */
const SESSION_HEADER = `x-${SESSION_NAME}-session`

export type SessionAccess
  = | { _tag: 'anonymous' }
    | { _tag: 'carried' }

/**
 * Decide whether a request carries a session to read.
 *
 * h3's `useSession`, and so nuxt-auth-utils' `getUserSession`, mints a new
 * session and sets its cookie on any request that arrives without one. That
 * put a `nuxt-session` cookie on anonymous `/api/skills` responses, and a
 * response that sets a cookie is never stored by a shared cache. So a request
 * opens a session only when it already brings one. Sign-in writes the first
 * one.
 */
export function decideSessionAccess(input: { cookie: string | undefined, sessionHeader: string | undefined }): SessionAccess {
  if (input.sessionHeader)
    return { _tag: 'carried' }
  return hasCookie(input.cookie, SESSION_NAME) ? { _tag: 'carried' } : { _tag: 'anonymous' }
}

/**
 * The session a request carries, or null.
 *
 * Every server read of the cookie session goes through here. ESLint bans a
 * direct `getUserSession()` call, because on an anonymous request that call
 * sets a cookie.
 */
export async function readUserSession(event: H3Event): Promise<UserSession | null> {
  if (requestSessionAccess(event)._tag === 'anonymous')
    return null
  // eslint-disable-next-line no-restricted-syntax -- the one sanctioned read, after the anonymous check
  const session = await getUserSession(event) as Partial<UserSession>
  return session.user ? session as UserSession : null
}

export function requestSessionAccess(event: H3Event): SessionAccess {
  return decideSessionAccess({
    cookie: getRequestHeader(event, 'cookie'),
    sessionHeader: getRequestHeader(event, SESSION_HEADER),
  })
}

function hasCookie(header: string | undefined, name: string): boolean {
  if (!header)
    return false
  return header.split(';').some((pair) => {
    const separator = pair.indexOf('=')
    if (separator === -1)
      return false
    return pair.slice(0, separator).trim() === name && pair.slice(separator + 1).trim() !== ''
  })
}
