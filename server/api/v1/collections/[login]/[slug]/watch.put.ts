import { collectionsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { watchCollection } from '../../../../../utils/collections'

export default defineApiOperation({
  operation: collectionsV1.operations.watch,
  handler: async ({ platform, input, user }) => {
    const { login, slug } = input.params
    const outcome = await watchCollection(platform.db, user.id, login, slug)
    if (outcome._tag === 'NotFound')
      return operationFailure('NOT_FOUND', `No collection @${login}/${slug}.`)
    return { watched: outcome.repositories }
  },
})
