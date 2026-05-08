import { requireUserRow } from '../../../utils/users'

interface Body {
  source?: string
  repos?: Array<{ owner: string, repo: string }>
}

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const body = await readBody<Body>(event)
  const repos = Array.isArray(body?.repos) ? body.repos : []
  const source = typeof body?.source === 'string' && body.source ? body.source : 'manual'
  if (!repos.length)
    return { ok: true, inserted: 0 }
  const db = event.context.cloudflare.env.DB as D1Database
  const now = Math.floor(Date.now() / 1000)
  const stmts = repos
    .filter(r => r && typeof r.owner === 'string' && typeof r.repo === 'string')
    .map(r => db.prepare(
      `INSERT OR IGNORE INTO skill_subscriptions (user_id, owner, repo, source, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(u.id, r.owner, r.repo, source, now))
  if (stmts.length)
    await db.batch(stmts)
  return { ok: true, inserted: stmts.length }
})
