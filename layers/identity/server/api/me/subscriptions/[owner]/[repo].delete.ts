import { defineApiHandler } from '#shared/server/handler'
import { identityMutationResponseSchema } from '../../../../../shared/contracts/account'
import { authenticated } from '../../../../policies/authenticated'
import { requireUserRow } from '../../../../utils/users'
import { unwatchRepository } from '../../../../utils/watches'

export default defineApiHandler({
  policy: [authenticated],
  response: identityMutationResponseSchema,
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const owner = getRouterParam(event, 'owner', { decode: true })
    const repo = getRouterParam(event, 'repo', { decode: true })
    if (!owner || !repo)
      throw createError({ statusCode: 400, message: 'Missing owner/repo' })
    await unwatchRepository(platform.db, u.id, { owner, repo })
    return { ok: true as const }
  },
})
