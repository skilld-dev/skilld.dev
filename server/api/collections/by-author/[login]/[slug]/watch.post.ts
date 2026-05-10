import { authenticated } from '~~/server/policies/authenticated'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform, user }) => {
    const userId = user!.id
    const login = getRouterParam(event, 'login')
    const slug = getRouterParam(event, 'slug')
    if (!login || !slug)
      throw createError({ statusCode: 400, message: 'Missing login or slug' })

    const skills = await platform.db.prepare(
      `SELECT cs.owner, cs.repo
       FROM collection_skills_v2 cs
       JOIN collections_v2 c ON c.id = cs.collection_id
       JOIN users u ON u.id = c.author_user_id
       WHERE u.login = ?1 AND c.slug = ?2 AND c.deleted_at IS NULL`,
    ).bind(login, slug).all<{ owner: string, repo: string }>()

    const now = Math.floor(Date.now() / 1000)
    const source = `collection:${slug}`
    const stmts = (skills.results ?? []).map(r => platform.db.prepare(
      `INSERT OR IGNORE INTO skill_subscriptions (user_id, owner, repo, source, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(userId, r.owner, r.repo, source, now))
    if (stmts.length)
      await platform.db.batch(stmts)

    return { ok: true as const, count: stmts.length }
  },
})
