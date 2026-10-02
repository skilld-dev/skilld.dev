import { accountV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { unpublishOwnRepository } from '../../../../../utils/account-repositories'
import { getUserById } from '../../../../../utils/users'

export default defineApiOperation({
  operation: accountV1.operations.unpublishRepository,
  handler: async ({ event, platform, input, user }) => {
    const row = await getUserById(event, user.id)
    if (!row)
      return operationFailure('AUTH_REQUIRED', 'This account no longer exists. Sign in again.')
    const { owner, repository } = input.params
    const result = await unpublishOwnRepository(platform.db, row.login, { owner, repo: repository })
    if (result._tag === 'NotOwner')
      return operationFailure('FORBIDDEN', `You can unpublish only Repositories that ${row.login} owns.`)
    return null
  },
})
