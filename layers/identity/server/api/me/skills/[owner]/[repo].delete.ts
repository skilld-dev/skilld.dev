import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../../policies/authenticated'
import { unpublishOwnRepository } from '../../../../utils/account-repositories'
import { requireUserRow } from '../../../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const owner = getRouterParam(event, 'owner') ?? ''
    const repo = getRouterParam(event, 'repo') ?? ''

    if (!owner || !repo)
      throw createError({ statusCode: 400, message: 'owner and repo required' })
    const result = await unpublishOwnRepository(platform.db, u.login, { owner, repo })
    if (result._tag === 'NotOwner')
      throw createError({ statusCode: 403, message: 'You can only unpublish your own repos' })

    return { ok: true as const, deleted: result.deleted }
  },
})
