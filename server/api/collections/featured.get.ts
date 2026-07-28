import { getDB } from '#server/utils/db'
import { featuredCollectionSkillsSql } from '#server/utils/homepage-queries'

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

const homepageCollectionSlugs = [
  'agent-building-stack',
  'typescript-engineering-stack',
  'agent-workflow-stack',
] as const

export default defineCachedEventHandler(
  async (event): Promise<FeaturedCollectionsResponse> => {
    const db = getDB(event)
    const slugPlaceholders = homepageCollectionSlugs.map(() => '?').join(',')
    const res = await db
      .prepare(
        `SELECT c.id, u.login AS author_login, c.slug, c.name, c.preamble, c.featured_at, c.updated_at
         FROM collections_v2 c
         JOIN users u ON u.id = c.author_user_id
         WHERE c.featured = 1
           AND c.deleted_at IS NULL
           AND u.login = 'harlan-zw'
           AND c.slug IN (${slugPlaceholders})
         ORDER BY CASE c.slug
           WHEN 'agent-building-stack' THEN 0
           WHEN 'typescript-engineering-stack' THEN 1
           WHEN 'agent-workflow-stack' THEN 2
           ELSE 3
         END
         LIMIT 3`,
      )
      .bind(...homepageCollectionSlugs)
      .all<CollectionRow>()
    const rows = res.results ?? []
    const ids = rows.map(row => row.id)
    const skillsByCollection = new Map<number, CollectionSkillRow[]>()

    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',')
      const skillsRes = await db
        .prepare(featuredCollectionSkillsSql(placeholders))
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
  { maxAge: 30, swr: false, name: 'collections-featured-origin-v2' },
)
