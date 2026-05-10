import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const now = Math.floor(Date.now() / 1000)
    await platform.db.prepare(
      `UPDATE users SET onboarded_at = COALESCE(onboarded_at, ?1) WHERE id = ?2`,
    ).bind(now, u.id).run()

    const session = await getUserSession(event)
    if (session.user) {
      await setUserSession(event, {
        ...session,
        user: { ...session.user, onboarded: true },
      })
    }
    return { ok: true as const }
  },
})
