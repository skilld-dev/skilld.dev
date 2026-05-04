import { requireAdmin } from '../../../utils/admin'

interface Body {
  status?: 'approved' | 'rejected'
  role?: 'author' | 'community'
}

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id))
    throw createError({ statusCode: 400, message: 'Invalid id' })

  const body = await readBody<Body>(event)
  const updates: string[] = []
  const binds: (string | number)[] = []

  if (body.status) {
    updates.push('status = ?')
    binds.push(body.status)
    if (body.status === 'approved') {
      updates.push('approved_by = ?', 'approved_at = ?')
      binds.push(admin.email, Math.floor(Date.now() / 1000))
    }
  }
  if (body.role) {
    updates.push('role = ?')
    binds.push(body.role)
  }
  if (!updates.length)
    throw createError({ statusCode: 400, message: 'Nothing to update' })

  binds.push(id)
  await getDB(event)
    .prepare(`UPDATE skill_social_posts SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run()

  return { ok: true }
})
