import { defineApiHandler } from '#shared/server/handler'

interface PublicLikeRow {
  owner: string
  repo: string
  name: string
  slug: string
  description: string | null
  stars: number | null
  likeCount: number
  likedAt: number
}

/**
 * Public list behind /@<login>/liked. Only skills still present in the registry
 * are returned — an INNER JOIN, unlike the owner's own list, because a visitor
 * has no use for a row that no longer resolves to a page.
 */
export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login')
    if (!login)
      throw createError({ statusCode: 400, message: 'Missing login' })

    const user = await platform.db.prepare(
      `SELECT id, login, name, avatar FROM users WHERE login = ?1 COLLATE NOCASE`,
    ).bind(login).first<{ id: number, login: string, name: string | null, avatar: string | null }>()

    if (!user)
      throw createError({ statusCode: 404, message: 'Not found' })

    const { results } = await platform.db.prepare(
      `SELECT
         s.owner       AS owner,
         s.repo        AS repo,
         s.name        AS name,
         s.slug        AS slug,
         s.description AS description,
         r.stars       AS stars,
         s.like_count  AS likeCount,
         l.created_at  AS likedAt
       FROM skill_likes l
       JOIN skills s ON s.owner = l.owner AND s.repo = l.repo AND s.name = l.name
       LEFT JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
       WHERE l.user_id = ?1
       ORDER BY l.created_at DESC
       LIMIT 200`,
    ).bind(user.id).all<PublicLikeRow>()

    return {
      author: { login: user.login, name: user.name, avatar: user.avatar },
      items: results ?? [],
    }
  },
})
