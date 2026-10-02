import { watchesV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { repositoryExists, watchRepository } from '../../../../../utils/watches'

export default defineApiOperation({
  operation: watchesV1.operations.create,
  handler: async ({ platform, input, user }) => {
    const { owner, repository } = input.params
    const ref = { owner, repo: repository }
    if (!await repositoryExists(platform.db, ref))
      return operationFailure('NOT_FOUND', `The registry holds no Repository ${owner}/${repository}.`)
    await watchRepository(platform.db, user.id, ref)
    return null
  },
})
