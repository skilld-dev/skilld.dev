import { defineApiHandler } from '#shared/server/handler'
import { canonicalRepoSkillPath } from '#shared/skill-routes'
import { lookupLikedList } from '../../../utils/liked-list-access'

interface PublicLikeRow {
  owner: string
  repo: string
  name: string
  slug: string
  description: string | null
  stars: number | null
  likeCount: number
  likedAt: number
  repoSkillCount: number
}

/**
 * The list behind /@<login>/liked. Only Skills still present in the registry
 * are returned: an INNER JOIN, unlike the owner's own list, because a visitor
 * has no use for a row that no longer resolves to a page.
 *
 * The list is private by default. It returns 404 unless its owner turned it
 * on or the viewer is the owner.
 */
export default defineApiHandler({
  handler: async ({ event, platform, user: viewer }) => {
    const login = getRouterParam(event, 'login')
    if (!login)
      throw createError({ statusCode: 400, message: 'Missing login' })

    // The answer depends on the viewer, so no shared cache may keep it.
    setHeader(event, 'cache-control', 'private, no-store')

    const lookup = await lookupLikedList(platform.db, login, viewer?.id ?? null)
    if (lookup._tag === 'not_found')
      throw createError({ statusCode: 404, message: 'Not found' })
    const { owner: user, access } = lookup

    const { results } = await platform.db.prepare(
      `SELECT
         s.owner       AS owner,
         s.repo        AS repo,
         s.name        AS name,
         s.slug        AS slug,
         s.description AS description,
         r.stars       AS stars,
         s.like_count  AS likeCount,
         l.created_at  AS likedAt,
         (SELECT COUNT(*) FROM skills repo_skills
          WHERE repo_skills.owner = s.owner
            AND repo_skills.repo = s.repo
            AND repo_skills.source_resolved = 1) AS repoSkillCount
       FROM skill_likes l
       JOIN skills s ON s.owner = l.owner AND s.repo = l.repo AND s.name = l.name
       LEFT JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
       WHERE l.user_id = ?1
       ORDER BY l.created_at DESC
       LIMIT 200`,
    ).bind(user.id).all<PublicLikeRow>()

    return {
      access,
      author: { login: user.login, name: user.name, avatar: user.avatar },
      items: (results ?? []).map(skill => ({
        ...skill,
        registryPath: canonicalRepoSkillPath({
          owner: skill.owner,
          repo: skill.repo,
          name: skill.name,
          repoSkillCount: skill.repoSkillCount,
        }),
      })),
    }
  },
})
