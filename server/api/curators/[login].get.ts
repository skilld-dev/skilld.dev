import { CuratorPayloadSchema } from 'skilld-protocol/wire'
import { defineApiHandler } from '#shared/server/handler'

interface CollectionRow {
  slug: string
  name: string
  item_count: number
}

export default defineApiHandler({
  response: CuratorPayloadSchema,
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    if (!login)
      throw createError({ statusCode: 400, message: 'Missing login' })

    const result = await platform.db.prepare(
      `SELECT c.slug, c.name,
              (SELECT COUNT(*) FROM collection_skills_v2 cs WHERE cs.collection_id = c.id) AS item_count
       FROM collections_v2 c
       JOIN users u ON u.id = c.author_user_id
       WHERE u.login = ?1 AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC`,
    ).bind(login).all<CollectionRow>()

    return {
      login,
      collections: (result.results ?? []).map(collection => ({
        slug: collection.slug,
        name: collection.name,
        itemCount: collection.item_count,
      })),
    }
  },
})
