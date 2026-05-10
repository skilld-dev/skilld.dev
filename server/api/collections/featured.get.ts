import { getDB } from '../../../shared/server/db'

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

interface CollectionSkillRow {
  collection_id: number
  position: number
  owner: string
  repo: string
  reason: string | null
}

export interface FeaturedCollectionsResponse {
  items: Array<{
    authorLogin: string
    slug: string
    name: string
    preamble: string | null
    skillCount: number
    updatedAt: number
    skills: Array<{
      owner: string
      repo: string
      reason: string | null
    }>
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
         LIMIT 10`,
      )
      .all<CollectionRow>()
    const rows = res.results ?? []
    const ids = rows.map(row => row.id)
    const skillsByCollection = new Map<number, CollectionSkillRow[]>()

    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',')
      const skillsRes = await db
        .prepare(
          `SELECT collection_id, position, owner, repo, reason
           FROM collection_skills_v2
           WHERE collection_id IN (${placeholders})
           ORDER BY collection_id ASC, position ASC`,
        )
        .bind(...ids)
        .all<CollectionSkillRow>()

      for (const skill of skillsRes.results ?? []) {
        const skills = skillsByCollection.get(skill.collection_id) ?? []
        skills.push(skill)
        skillsByCollection.set(skill.collection_id, skills)
      }
    }

    const items = rows.map(row => ({
      authorLogin: row.author_login,
      slug: row.slug,
      name: row.name,
      preamble: row.preamble,
      skillCount: row.skill_count,
      updatedAt: row.updated_at,
      skills: (skillsByCollection.get(row.id) ?? []).map(skill => ({
        owner: skill.owner,
        repo: skill.repo,
        reason: skill.reason,
      })),
    }))
    return { items }
  },
  { maxAge: 60, swr: true, name: 'collections-featured' },
)
