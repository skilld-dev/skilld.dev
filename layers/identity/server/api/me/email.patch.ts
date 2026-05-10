import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { EmailPatchInput } from '../../schemas/email'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  schema: EmailPatchInput,
  policy: [authenticated],
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    const email = body.digest_email || u.digest_email
    const optIn = body.email_opt_in ? 1 : 0
    await platform.db.prepare(
      `UPDATE users SET digest_email = ?1, email_opt_in = ?2 WHERE id = ?3`,
    ).bind(email, optIn, u.id).run()
    return { ok: true as const }
  },
})
