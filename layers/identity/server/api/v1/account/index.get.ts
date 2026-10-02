import { accountV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentAccount } from '../../../presenters/account-v1'
import { getUserById } from '../../../utils/users'

export default defineApiOperation({
  operation: accountV1.operations.get,
  handler: async ({ event, user }) => {
    const row = await getUserById(event, user.id)
    return row ? presentAccount(row) : operationFailure('AUTH_REQUIRED', 'This account no longer exists. Sign in again.')
  },
})
