import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../../policies/authenticated'
import { requireUserRow } from '../../../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const owner = getRouterParam(event, 'owner') ?? ''
    const repo = getRouterParam(event, 'repo') ?? ''

    if (!owner || !repo)
      throw createError({ statusCode: 400, message: 'owner and repo required' })
    if (owner.toLowerCase() !== u.login.toLowerCase())
      throw createError({ statusCode: 403, message: 'You can only unpublish your own repos' })

    const { db } = platform
    const res = await db
      .prepare(`DELETE FROM skills WHERE owner = ?1 AND repo = ?2`)
      .bind(owner, repo)
      .run()

    return { ok: true as const, deleted: res.meta?.changes ?? 0 }
  },
})
