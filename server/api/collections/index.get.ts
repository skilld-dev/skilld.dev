import { getDB } from '#server/utils/db'

interface CollectionIndexRow {
  id: number
  author_login: string
  author_name: string | null
  author_avatar: string | null
  slug: string
  name: string
  preamble: string | null
  updated_at: number
}

interface CollectionIndexSkillRow {
  collection_id: number
  owner: string
  repo: string
  name: string | null
  display_name: string | null
}

export interface CollectionsIndexResponse {
  featured: CollectionIndexItem[]
  recent: CollectionIndexItem[]
  total: number
  fetchedAt: string
}

interface CollectionIndexItem {
  authorLogin: string
  authorDisplayName: string | null
  authorAvatar: string | null
  slug: string
  name: string
  preamble: string | null
  preambleExcerpt: string | null
  skillCount: number
  skills: string[]
  updatedAt: number
}

export default defineCachedEventHandler(
  async (event): Promise<CollectionsIndexResponse> => {
    const db = getDB(event)

    const [featuredResult, recentResult, totalResult] = await db.batch([
      db.prepare(
        `SELECT c.id, u.login AS author_login, u.name AS author_name, u.avatar AS author_avatar,
                c.slug, c.name, c.preamble, c.updated_at
         FROM collections_v2 c
         JOIN users u ON u.id = c.author_user_id
         WHERE c.featured = 1 AND c.deleted_at IS NULL
         ORDER BY c.featured_at DESC, c.updated_at DESC
         LIMIT 10`,
      ),
      db.prepare(
        `SELECT c.id, u.login AS author_login, u.name AS author_name, u.avatar AS author_avatar,
                c.slug, c.name, c.preamble, c.updated_at
         FROM collections_v2 c
         JOIN users u ON u.id = c.author_user_id
         WHERE c.deleted_at IS NULL
         ORDER BY c.created_at DESC
         LIMIT 20`,
      ),
      db.prepare(
        `SELECT COUNT(*) AS total
         FROM collections_v2
         WHERE deleted_at IS NULL`,
      ),
    ])

    const featuredRows = (featuredResult?.results ?? []) as CollectionIndexRow[]
    const recentRows = (recentResult?.results ?? []) as CollectionIndexRow[]
    const totalRow = totalResult?.results[0] as { total: number } | undefined
    const allRows = [...featuredRows, ...recentRows]
    const skillsByCollection = await loadSkillLabels(db, allRows)

    return {
      featured: featuredRows.map(row => collectionIndexItem(row, skillsByCollection)),
      recent: recentRows.map(row => collectionIndexItem(row, skillsByCollection)),
      total: totalRow?.total ?? 0,
      fetchedAt: new Date().toISOString(),
    }
  },
  { maxAge: 30, swr: false, name: 'collections-index-origin-v1' },
)

async function loadSkillLabels(db: D1Database, rows: CollectionIndexRow[]) {
  const ids = [...new Set(rows.map(row => row.id))]
  const skillsByCollection = new Map<number, string[]>()
  if (!ids.length)
    return skillsByCollection

  const placeholders = ids.map(() => '?').join(',')
  const skillsRes = await db.prepare(
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
     SELECT cs.collection_id, cs.owner, cs.repo, rs.name, rs.display_name
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
  ).bind(...ids).all<CollectionIndexSkillRow>()

  for (const skill of skillsRes.results ?? []) {
    const labels = skillsByCollection.get(skill.collection_id) ?? []
    labels.push(skill.name ? `/${skill.name}` : skill.repo)
    skillsByCollection.set(skill.collection_id, labels)
  }

  return skillsByCollection
}

function collectionIndexItem(row: CollectionIndexRow, skillsByCollection: Map<number, string[]>): CollectionIndexItem {
  const skills = skillsByCollection.get(row.id) ?? []
  return {
    authorLogin: row.author_login,
    authorDisplayName: row.author_name,
    authorAvatar: row.author_avatar,
    slug: row.slug,
    name: row.name,
    preamble: row.preamble,
    preambleExcerpt: row.preamble ? excerpt(row.preamble) : null,
    skillCount: skills.length,
    skills,
    updatedAt: row.updated_at,
  }
}

function excerpt(text: string) {
  if (text.length <= 180)
    return text

  return `${text.slice(0, 177).trimEnd()}...`
}
