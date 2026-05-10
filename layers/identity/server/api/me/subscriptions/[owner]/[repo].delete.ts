import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../../policies/authenticated'
import { requireUserRow } from '../../../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const owner = getRouterParam(event, 'owner')
    const repo = getRouterParam(event, 'repo')
    if (!owner || !repo)
      throw createError({ statusCode: 400, message: 'Missing owner/repo' })
    await platform.db.prepare(
      `DELETE FROM skill_subscriptions WHERE user_id = ?1 AND owner = ?2 AND repo = ?3`,
    ).bind(u.id, owner, repo).run()
    return { ok: true as const }
  },
})
