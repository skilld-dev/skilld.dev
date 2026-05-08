import { requireUserRow } from '../../utils/users'

interface Body {
  digest_email?: string
  email_opt_in?: boolean
}

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const body = await readBody<Body>(event)
  const email = typeof body?.digest_email === 'string' && body.digest_email
    ? body.digest_email.trim().slice(0, 254)
    : u.digest_email
  const optIn = body?.email_opt_in ? 1 : 0
  const db = event.context.cloudflare.env.DB as D1Database
  await db.prepare(
    `UPDATE users SET digest_email = ?1, email_opt_in = ?2 WHERE id = ?3`,
  ).bind(email, optIn, u.id).run()
  return { ok: true }
})
