import { defineApiHandler } from '#shared/server/handler'
import { identityMutationResponseSchema, identityPrivacyPatchBodySchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  schema: identityPrivacyPatchBodySchema,
  policy: [authenticated],
  response: identityMutationResponseSchema,
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    await platform.db.prepare(
      `UPDATE users SET likes_public = ?1 WHERE id = ?2`,
    ).bind(body.likes_public ? 1 : 0, u.id).run()
    return { ok: true as const }
  },
})
