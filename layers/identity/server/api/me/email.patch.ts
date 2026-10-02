import { defineApiHandler } from '#shared/server/handler'
import { identityEmailPatchBodySchema, identityMutationResponseSchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
import { planAccountSettings, updateAccountSettings } from '../../utils/account-settings'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  schema: identityEmailPatchBodySchema,
  policy: [authenticated],
  response: identityMutationResponseSchema,
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    // The schema drops blank addresses, so an opted-in caller can never wipe
    // the stored one here. Absent means unchanged, for every field: an
    // unrelated save must not silently flip `weekly_opt_in`.
    const plan = planAccountSettings(u, {
      email: body.digest_email,
      digest: body.email_opt_in,
      weekly: body.weekly_opt_in,
    })
    if (plan._tag === 'MissingAddress')
      throw createError({ statusCode: 400, message: 'Add a valid email address to receive emails' })
    await updateAccountSettings(platform.db, u.id, plan.columns)
    return { ok: true as const }
  },
})
