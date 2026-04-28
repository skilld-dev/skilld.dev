import { requireAdmin } from '../../../utils/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id))
    throw createError({ statusCode: 400, message: 'Invalid id' })
  await getDB(event)
    .prepare('DELETE FROM skill_social_posts WHERE id = ?')
    .bind(id)
    .run()
  return { ok: true }
})
