import { accountV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentAccount } from '../../../presenters/account-v1'
import { planAccountSettings, updateAccountSettings } from '../../../utils/account-settings'
import { getUserById } from '../../../utils/users'

export default defineApiOperation({
  operation: accountV1.operations.update,
  handler: async ({ event, platform, input, user }) => {
    const row = await getUserById(event, user.id)
    if (!row)
      return operationFailure('AUTH_REQUIRED', 'This account no longer exists. Sign in again.')
    const plan = planAccountSettings(row, input.body)
    if (plan._tag === 'MissingAddress')
      return operationFailure('INVALID_REQUEST', 'The account has no email address. Send `email` to turn on an email.')
    await updateAccountSettings(platform.db, row.id, plan.columns)
    return presentAccount({ ...row, ...plan.columns })
  },
})
