import { requireUserRow } from '../../../../utils/users'

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const owner = getRouterParam(event, 'owner')
  const repo = getRouterParam(event, 'repo')
  if (!owner || !repo)
    throw createError({ statusCode: 400, message: 'Missing owner/repo' })
  const db = event.context.cloudflare.env.DB as D1Database
  await db.prepare(
    `DELETE FROM skill_subscriptions WHERE user_id = ?1 AND owner = ?2 AND repo = ?3`,
  ).bind(u.id, owner, repo).run()
  return { ok: true }
})
