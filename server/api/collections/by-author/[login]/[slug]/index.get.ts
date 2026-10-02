import { collectionDetailPresenter } from '~~/server/presenters/collection'
import { loadCollectionDetail } from '~~/server/utils/collections'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    const slug = getRouterParam(event, 'slug') ?? ''
    if (!login || !slug)
      throw createError({ statusCode: 400, message: 'Missing login or slug' })

    const detail = await loadCollectionDetail(platform.db, login, slug)
    if (!detail)
      throw createError({ statusCode: 404, message: 'Collection not found' })

    return collectionDetailPresenter(detail.collection, detail.skills)
  },
})
