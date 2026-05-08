export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = session.user.id
  const login = getRouterParam(event, 'login')
  const slug = getRouterParam(event, 'slug')
  if (!login || !slug)
    throw createError({ statusCode: 400, message: 'Missing login or slug' })

  const db = event.context.cloudflare.env.DB as D1Database
  const skills = await db.prepare(
    `SELECT cs.owner, cs.repo
     FROM collection_skills_v2 cs
     JOIN collections_v2 c ON c.id = cs.collection_id
     JOIN users u ON u.id = c.author_user_id
     WHERE u.login = ?1 AND c.slug = ?2 AND c.deleted_at IS NULL`,
  ).bind(login, slug).all<{ owner: string, repo: string }>()

  const now = Math.floor(Date.now() / 1000)
  const source = `collection:${slug}`
  const stmts = (skills.results ?? []).map(r => db.prepare(
    `INSERT OR IGNORE INTO skill_subscriptions (user_id, owner, repo, source, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  ).bind(userId, r.owner, r.repo, source, now))
  if (stmts.length)
    await db.batch(stmts)

  return { ok: true, count: stmts.length }
})
