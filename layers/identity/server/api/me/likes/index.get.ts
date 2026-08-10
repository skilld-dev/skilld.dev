import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { requireUserRow } from '../../../utils/users'

interface LikeRow {
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
 * Feeds two callers: useLikes() hydrates the whole set once per session so
 * cached SSR'd skill cards can fill their hearts without an N+1, and /me
 * renders the same rows as a list. Card fields are joined in so /me does not
 * need a second round trip.
 */
export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const { results } = await platform.db.prepare(
      `SELECT
         l.owner        AS owner,
         l.repo         AS repo,
         l.name         AS name,
         l.created_at   AS likedAt,
         COALESCE(s.slug, l.owner || '/' || l.repo || '/' || l.name) AS slug,
         s.description  AS description,
         r.stars        AS stars,
         COALESCE(s.like_count, 0) AS likeCount
       FROM skill_likes l
       LEFT JOIN skills s ON s.owner = l.owner AND s.repo = l.repo AND s.name = l.name
       LEFT JOIN repos r ON r.owner = l.owner AND r.repo = l.repo
       WHERE l.user_id = ?1
       ORDER BY l.created_at DESC`,
    ).bind(u.id).all<LikeRow>()

    return { items: results ?? [] }
  },
})
