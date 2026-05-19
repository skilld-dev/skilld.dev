import { defineApiHandler } from '#shared/server/handler'

interface SkillRow {
  name: string
  owner: string
  repo: string
  display_name: string | null
  slug: string
  description: string | null
  modified_at: number | null
  last_synced_at: number | null
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    if (!login)
      throw createError({ statusCode: 400, message: 'login required' })

    const { db } = platform
    const res = await db
      .prepare(
        `SELECT name, owner, repo, display_name, slug, description, modified_at, last_synced_at
         FROM skills
         WHERE owner = ?1 COLLATE NOCASE
         ORDER BY COALESCE(modified_at, last_synced_at, 0) DESC`,
      )
      .bind(login)
      .all<SkillRow>()

    return {
      ok: true as const,
      items: res.results ?? [],
    }
  },
})
