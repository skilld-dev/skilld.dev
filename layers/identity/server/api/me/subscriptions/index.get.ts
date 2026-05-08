import { requireUserRow } from '../../../utils/users'

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const db = event.context.cloudflare.env.DB as D1Database
  const res = await db.prepare(
    `SELECT owner, repo, source, muted_until, created_at
     FROM skill_subscriptions
     WHERE user_id = ?1
     ORDER BY created_at DESC`,
  ).bind(u.id).all<{ owner: string, repo: string, source: string, muted_until: number | null, created_at: number }>()
  return { items: res.results ?? [] }
})
