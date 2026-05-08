import { getDB } from '../../../../utils/db'

interface CollectionRow {
  id: number
  author_login: string
  slug: string
  name: string
  preamble: string | null
  featured: number
  created_at: number
  updated_at: number
}

interface SkillRow {
  position: number
  owner: string
  repo: string
  reason: string | null
}

export default defineEventHandler(async (event) => {
  const login = getRouterParam(event, 'login') ?? ''
  const slug = getRouterParam(event, 'slug') ?? ''
  if (!login || !slug)
    throw createError({ statusCode: 400, message: 'Missing login or slug' })

  const db = getDB(event)
  const collection = await db
    .prepare(
      `SELECT c.id, u.login AS author_login, c.slug, c.name, c.preamble, c.featured, c.created_at, c.updated_at
       FROM collections_v2 c
       JOIN users u ON u.id = c.author_user_id
       WHERE u.login = ? AND c.slug = ? AND c.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(login, slug)
    .first<CollectionRow>()

  if (!collection)
    throw createError({ statusCode: 404, message: 'Collection not found' })

  const skillsRes = await db
    .prepare(
      `SELECT position, owner, repo, reason
       FROM collection_skills_v2
       WHERE collection_id = ?
       ORDER BY position ASC`,
    )
    .bind(collection.id)
    .all<SkillRow>()

  return {
    authorLogin: collection.author_login,
    slug: collection.slug,
    name: collection.name,
    preamble: collection.preamble,
    featured: Boolean(collection.featured),
    createdAt: collection.created_at,
    updatedAt: collection.updated_at,
    skills: (skillsRes.results ?? []).map(s => ({
      position: s.position,
      owner: s.owner,
      repo: s.repo,
      reason: s.reason,
    })),
  }
})
