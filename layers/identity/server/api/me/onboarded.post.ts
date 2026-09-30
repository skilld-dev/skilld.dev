import type { UserSession } from '#auth-utils'
import { defineApiHandler } from '#shared/server/handler'
import { identityMutationResponseSchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  response: identityMutationResponseSchema,
  handler: async ({ event, platform, session }) => {
    const u = await requireUserRow(event)
    const now = Math.floor(Date.now() / 1000)
    await platform.db.prepare(
      `UPDATE users SET onboarded_at = COALESCE(onboarded_at, ?1) WHERE id = ?2`,
    ).bind(now, u.id).run()

    // A bearer token has no cookie session to update. The handler context
    // types the session loosely; the cookie holds nuxt-auth-utils' shape.
    const current = session as unknown as UserSession | null
    if (current?.user) {
      await setUserSession(event, {
        ...current,
        user: { ...current.user, onboarded: true },
      })
    }
    return { ok: true as const }
  },
})
