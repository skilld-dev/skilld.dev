import { requestSessionAccess } from '#shared/server/session-access'

const SESSION_ROUTE = '/api/_auth/session'

/**
 * Answer the session lookup for a visitor who has no session.
 *
 * nuxt-auth-utils serves `GET /api/_auth/session` by reading the session, and
 * that read mints a session and sets its cookie when the request brings none.
 * The server now renders every public page signed out, so the browser asks
 * this route on each page load. Without this, every anonymous visitor would
 * collect a `nuxt-session` cookie on the first view. The module's handler
 * still answers every request that carries a session.
 */
export default defineEventHandler((event) => {
  if (event.method !== 'GET' || event.path.split('?')[0] !== SESSION_ROUTE)
    return
  if (requestSessionAccess(event)._tag === 'anonymous')
    return {}
})
