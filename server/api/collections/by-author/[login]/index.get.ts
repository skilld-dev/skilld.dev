import { collectionListEntryPresenter } from '~~/server/presenters/collection'
import { loadCuratorCollections } from '~~/server/utils/collections'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    if (!login)
      throw createError({ statusCode: 400, message: 'Missing login' })

    return { items: (await loadCuratorCollections(platform.db, login)).map(collectionListEntryPresenter) }
  },
})
