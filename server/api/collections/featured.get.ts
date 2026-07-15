import { getDB } from '../../../shared/server/db'

interface CollectionRow {
  id: number
  author_login: string
  slug: string
  name: string
  preamble: string | null
  featured_at: number | null
  updated_at: number
}

interface CollectionSkillRow {
  collection_id: number
  position: number
  owner: string
  repo: string
  name: string | null
  display_name: string | null
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
      name: string | null
      displayName: string | null
      reason: string | null
    }>
  }>
}

export default defineCachedEventHandler(
  async (event): Promise<FeaturedCollectionsResponse> => {
    const db = getDB(event)
    const res = await db
      .prepare(
        `SELECT c.id, u.login AS author_login, c.slug, c.name, c.preamble, c.featured_at, c.updated_at
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
          `WITH ranked_skills AS (
             SELECT s.owner, s.repo, s.name, s.display_name,
                    ROW_NUMBER() OVER (
                      PARTITION BY s.owner, s.repo
                      ORDER BY s.installs DESC, s.name ASC
                    ) AS rn
             FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
             WHERE (r.broken_since IS NULL OR r.broken_since > unixepoch() - 604800)
               AND s.source_resolved = 1
               AND s.rendered_status = 'ok'
           )
           SELECT cs.collection_id, cs.position, cs.owner, cs.repo, rs.name, rs.display_name, cs.reason
           FROM collection_skills_v2 cs
           JOIN ranked_skills rs
             ON rs.owner = cs.owner
            AND rs.repo = cs.repo
            AND (
              (cs.name IS NOT NULL AND rs.name = cs.name)
              OR (cs.name IS NULL AND rs.rn = 1)
            )
           WHERE cs.collection_id IN (${placeholders})
           ORDER BY cs.collection_id ASC, cs.position ASC`,
        )
        .bind(...ids)
        .all<CollectionSkillRow>()

      for (const skill of skillsRes.results ?? []) {
        const skills = skillsByCollection.get(skill.collection_id) ?? []
        skills.push(skill)
        skillsByCollection.set(skill.collection_id, skills)
      }
    }

    const items = rows.map((row) => {
      const skills = (skillsByCollection.get(row.id) ?? []).map(skill => ({
        owner: skill.owner,
        repo: skill.repo,
        name: skill.name,
        displayName: skill.display_name,
        reason: skill.reason,
      }))
      return {
        authorLogin: row.author_login,
        slug: row.slug,
        name: row.name,
        preamble: row.preamble,
        skillCount: skills.length,
        updatedAt: row.updated_at,
        skills,
      }
    })
    return { items }
  },
  { maxAge: 30, swr: false, name: 'collections-featured-origin-v1' },
)
