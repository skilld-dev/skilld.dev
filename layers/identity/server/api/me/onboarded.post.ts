import { requireUserRow } from '../../utils/users'

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const now = Math.floor(Date.now() / 1000)
  const db = event.context.cloudflare.env.DB as D1Database
  await db.prepare(
    `UPDATE users SET onboarded_at = COALESCE(onboarded_at, ?1) WHERE id = ?2`,
  ).bind(now, u.id).run()

  const session = await getUserSession(event)
  if (session.user) {
    await setUserSession(event, {
      ...session,
      user: { ...session.user, onboarded: true },
    })
  }
  return { ok: true }
})
