import type { CollectionDetailRow, CollectionSkillRow } from '~~/server/presenters/collection'
import {
  collectionDetailPresenter,

} from '~~/server/presenters/collection'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    const slug = getRouterParam(event, 'slug') ?? ''
    if (!login || !slug)
      throw createError({ statusCode: 400, message: 'Missing login or slug' })

    const collection = await platform.db.prepare(
      `SELECT c.id, u.login AS author_login, c.slug, c.name, c.preamble, c.featured, c.created_at, c.updated_at
       FROM collections_v2 c
       JOIN users u ON u.id = c.author_user_id
       WHERE u.login = ? AND c.slug = ? AND c.deleted_at IS NULL
       LIMIT 1`,
    ).bind(login, slug).first<CollectionDetailRow>()

    if (!collection)
      throw createError({ statusCode: 404, message: 'Collection not found' })

    const skillsRes = await platform.db.prepare(
      `SELECT position, owner, repo, reason
       FROM collection_skills_v2
       WHERE collection_id = ?
       ORDER BY position ASC`,
    ).bind(collection.id).all<CollectionSkillRow>()

    return collectionDetailPresenter(collection, skillsRes.results ?? [])
  },
})
