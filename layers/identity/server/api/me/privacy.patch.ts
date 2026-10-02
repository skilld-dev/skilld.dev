import { defineApiHandler } from '#shared/server/handler'
import { identityMutationResponseSchema, identityPrivacyPatchBodySchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
import { updateAccountSettings } from '../../utils/account-settings'
import { requireUserRow } from '../../utils/users'

/**
 * Saves the account's privacy switches.
 *
 * Both are on by default. A request names only the switches it changes, so
 * turning one off cannot silently reset the other.
 */
export default defineApiHandler({
  schema: identityPrivacyPatchBodySchema,
  policy: [authenticated],
  response: identityMutationResponseSchema,
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    await updateAccountSettings(platform.db, u.id, {
      likes_public: body.likes_public === undefined ? undefined : body.likes_public ? 1 : 0,
      repo_indexing: body.repo_indexing === undefined ? undefined : body.repo_indexing ? 1 : 0,
    })
    return { ok: true as const }
  },
})
