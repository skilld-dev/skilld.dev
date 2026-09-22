import { defineApiHandler } from '#shared/server/handler'
import { identityMutationResponseSchema, identityPrivacyPatchBodySchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
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
    const updates: string[] = []
    const values: (number | string)[] = []
    if (body.likes_public !== undefined) {
      updates.push(`likes_public = ?${updates.length + 1}`)
      values.push(body.likes_public ? 1 : 0)
    }
    if (body.repo_indexing !== undefined) {
      updates.push(`repo_indexing = ?${updates.length + 1}`)
      values.push(body.repo_indexing ? 1 : 0)
    }

    await platform.db.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?${updates.length + 1}`,
    ).bind(...values, u.id).run()
    return { ok: true as const }
  },
})
