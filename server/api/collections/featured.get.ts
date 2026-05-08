import { getDB } from '../../utils/db'

interface CollectionRow {
  id: number
  author_login: string
  slug: string
  name: string
  preamble: string | null
  featured_at: number | null
  updated_at: number
  skill_count: number
}

export interface FeaturedCollectionsResponse {
  items: Array<{
    authorLogin: string
    slug: string
    name: string
    preamble: string | null
    skillCount: number
    updatedAt: number
  }>
}

export default defineCachedEventHandler(
  async (event): Promise<FeaturedCollectionsResponse> => {
    const db = getDB(event)
    const res = await db
      .prepare(
        `SELECT c.id, u.login AS author_login, c.slug, c.name, c.preamble, c.featured_at, c.updated_at,
                (SELECT COUNT(*) FROM collection_skills_v2 cs WHERE cs.collection_id = c.id) AS skill_count
         FROM collections_v2 c
         JOIN users u ON u.id = c.author_user_id
         WHERE c.featured = 1 AND c.deleted_at IS NULL
         ORDER BY c.featured_at DESC
         LIMIT 6`,
      )
      .all<CollectionRow>()
    const items = (res.results ?? []).map(row => ({
      authorLogin: row.author_login,
      slug: row.slug,
      name: row.name,
      preamble: row.preamble,
      skillCount: row.skill_count,
      updatedAt: row.updated_at,
    }))
    return { items }
  },
  { maxAge: 60, swr: true, name: 'collections-featured' },
)
