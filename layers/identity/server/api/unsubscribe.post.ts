import { verifyUnsubToken } from '../utils/email'

// RFC 8058 one-click POST. Same logic as the GET, no body required.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const query = getQuery(event)
  const token = typeof query.t === 'string' ? query.t : ''
  const userId = await verifyUnsubToken(token, config.tokenKey as string)
  if (!userId) {
    setResponseStatus(event, 400)
    return { ok: false }
  }
  const db = event.context.cloudflare.env.DB as D1Database
  await db.prepare(`UPDATE users SET email_opt_in = 0 WHERE id = ?1`).bind(userId).run()
  return { ok: true }
})
