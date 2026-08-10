import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../../../policies/authenticated'
import { unlikeSkill } from '../../../../../utils/likes'
import { requireUserRow } from '../../../../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const owner = getRouterParam(event, 'owner')
    const repo = getRouterParam(event, 'repo')
    const name = getRouterParam(event, 'name')
    if (!owner || !repo || !name)
      throw createError({ statusCode: 400, message: 'Missing owner/repo/name' })
    await unlikeSkill(platform.db, u.id, { owner, repo, name })
    return { ok: true as const }
  },
})
