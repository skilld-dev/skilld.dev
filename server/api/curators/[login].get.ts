import { CuratorPayloadSchema } from 'skilld-protocol/wire'
import { loadCuratorCollections } from '~~/server/utils/collections'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  response: CuratorPayloadSchema,
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    if (!login)
      throw createError({ statusCode: 400, message: 'Missing login' })

    const collections = await loadCuratorCollections(platform.db, login)
    return {
      login,
      collections: collections.map(collection => ({
        slug: collection.slug,
        name: collection.name,
        itemCount: collection.skill_count,
      })),
    }
  },
})
