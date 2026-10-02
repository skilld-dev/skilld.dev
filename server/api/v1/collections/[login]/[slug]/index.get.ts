import { collectionsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentCollection } from '../../../../../presenters/collection-v1'
import { loadCollectionPage } from '../../../../../utils/collections'

export default defineApiOperation({
  operation: collectionsV1.operations.get,
  handler: async ({ platform, input }) => {
    const { login, slug } = input.params
    const page = await loadCollectionPage(platform.db, login, slug, input.query)
    if (!page)
      return operationFailure('NOT_FOUND', `No collection @${login}/${slug}.`)
    return presentCollection(page)
  },
})
