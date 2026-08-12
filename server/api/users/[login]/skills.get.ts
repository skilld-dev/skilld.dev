import { defineApiHandler } from '#shared/server/handler'

interface SkillRow {
  name: string
  owner: string
  repo: string
  display_name: string | null
  slug: string
  description: string | null
  likeCount: number
  modified_at: number | null
  last_synced_at: number | null
  skill_path: string | null
  source_owner: string | null
  source_repo: string | null
  default_branch: string | null
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    if (!login)
      throw createError({ statusCode: 400, message: 'login required' })

    const { db } = platform
    const res = await db
      .prepare(
        `SELECT s.name, s.owner, s.repo, s.display_name, s.slug, s.description,
                s.like_count AS likeCount,
                s.modified_at, s.last_synced_at, s.rendered_skill_path AS skill_path,
                r.source_owner, r.source_repo, r.default_branch
         FROM skills s
         JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         WHERE s.owner = ?1 COLLATE NOCASE
         ORDER BY COALESCE(s.modified_at, s.last_synced_at, 0) DESC`,
      )
      .bind(login)
      .all<SkillRow>()

    return {
      ok: true as const,
      items: res.results ?? [],
    }
  },
})
