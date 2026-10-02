import { collectionsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { findAuthorCollectionId, removeCollectionSkill } from '../../../../../../../../utils/collections'

export default defineApiOperation({
  operation: collectionsV1.operations.removeSkill,
  handler: async ({ platform, input, user }) => {
    const { login, slug, owner, repository, name } = input.params
    if (login !== user.login)
      return operationFailure('FORBIDDEN', 'You can change only your own collections.')
    const collectionId = await findAuthorCollectionId(platform.db, user.id, slug)
    if (collectionId === null)
      return operationFailure('NOT_FOUND', `You have no collection with the slug ${slug}.`)
    await removeCollectionSkill(platform.db, collectionId, { owner, repo: repository, name })
    return null
  },
})
