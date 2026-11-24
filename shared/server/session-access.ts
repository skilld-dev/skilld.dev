import type { H3Event } from 'h3'
import type { SessionEvent } from 'nuxt/server'
import type { UserSession } from './handler'

/**
 * The session cookie name. `nuxt.config.ts` passes it to nuxt-auth-utils, so
 * this constant and the cookie the module writes cannot drift apart.
 */
export const SESSION_NAME = 'nuxt-auth-session'

export function authSessionEvent(event: H3Event): H3Event & SessionEvent {
  // The session helpers use Web Headers. srvx makes some unrelated Request fields optional.
  return event as H3Event & SessionEvent
}

export type SessionAccess
  = | { _tag: 'anonymous' }
    | { _tag: 'carried' }

/**
 * Decide whether a request carries a session to read.
 *
 * `getUserSession` mints a new
 * session and sets its cookie on any request that arrives without one. That
 * put a session cookie on anonymous `/api/skills` responses, and a
 * response that sets a cookie is never stored by a shared cache. So a request
 * opens a session only when it already brings one. Sign-in writes the first
 * one.
 */
export function decideSessionAccess(cookie: string | null): SessionAccess {
  return hasCookie(cookie, SESSION_NAME) ? { _tag: 'carried' } : { _tag: 'anonymous' }
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
  const session = await getUserSession(authSessionEvent(event)) as Partial<UserSession>
  return session.user ? session as UserSession : null
}

export function requestSessionAccess(event: H3Event): SessionAccess {
  return decideSessionAccess(event.req.headers.get('cookie'))
}

function hasCookie(header: string | null, name: string): boolean {
  if (!header)
    return false
  return header.split(';').some((pair) => {
    const separator = pair.indexOf('=')
    if (separator === -1)
      return false
    return pair.slice(0, separator).trim() === name && pair.slice(separator + 1).trim() !== ''
  })
}
