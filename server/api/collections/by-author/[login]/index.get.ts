import type { CollectionListRow } from '~~/server/presenters/collection'
import { collectionListEntryPresenter } from '~~/server/presenters/collection'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    if (!login)
      throw createError({ statusCode: 400, message: 'Missing login' })

    const res = await platform.db.prepare(
      `SELECT c.slug, c.name, c.preamble, c.featured, c.updated_at,
              (SELECT COUNT(*) FROM collection_skills_v2 cs WHERE cs.collection_id = c.id) AS skill_count
       FROM collections_v2 c
       JOIN users u ON u.id = c.author_user_id
       WHERE u.login = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC`,
    ).bind(login).all<CollectionListRow>()

    return { items: (res.results ?? []).map(collectionListEntryPresenter) }
  },
})
