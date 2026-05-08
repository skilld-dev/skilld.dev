import { getDB } from '../../../../utils/db'

interface CollectionRow {
  slug: string
  name: string
  preamble: string | null
  featured: number
  updated_at: number
  skill_count: number
}

export default defineEventHandler(async (event) => {
  const login = getRouterParam(event, 'login') ?? ''
  if (!login)
    throw createError({ statusCode: 400, message: 'Missing login' })

  const db = getDB(event)
  const res = await db
    .prepare(
      `SELECT c.slug, c.name, c.preamble, c.featured, c.updated_at,
              (SELECT COUNT(*) FROM collection_skills_v2 cs WHERE cs.collection_id = c.id) AS skill_count
       FROM collections_v2 c
       WHERE c.author_login = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC`,
    )
    .bind(login)
    .all<CollectionRow>()

  return {
    items: (res.results ?? []).map(row => ({
      slug: row.slug,
      name: row.name,
      preamble: row.preamble,
      featured: Boolean(row.featured),
      updatedAt: row.updated_at,
      skillCount: row.skill_count,
    })),
  }
})
