import { defineApiHandler } from '#shared/server/handler'
import { identityEmailPatchBodySchema, identityMutationResponseSchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  schema: identityEmailPatchBodySchema,
  policy: [authenticated],
  response: identityMutationResponseSchema,
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    const email = body.digest_email || u.digest_email
    const optIn = body.email_opt_in ? 1 : 0
    // `weekly_opt_in` is optional, so an unrelated save must not silently flip
    // it. Absent means unchanged, not false.
    const weeklyOptOut = body.weekly_opt_in === undefined
      ? u.weekly_opt_out
      : (body.weekly_opt_in ? 0 : 1)
    await platform.db.prepare(
      `UPDATE users SET digest_email = ?1, email_opt_in = ?2, weekly_opt_out = ?3 WHERE id = ?4`,
    ).bind(email, optIn, weeklyOptOut, u.id).run()
    return { ok: true as const }
  },
})
