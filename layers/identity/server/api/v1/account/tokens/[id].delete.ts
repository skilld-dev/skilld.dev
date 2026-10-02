import { tokensV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { revokeCliToken } from '../../../../utils/cli-tokens'

export default defineApiOperation({
  operation: tokensV1.operations.revoke,
  handler: async ({ platform, input, user }) => {
    const outcome = await revokeCliToken(platform.db, user.id, input.params.id)
    return outcome === 'revoked' ? null : operationFailure('NOT_FOUND', `This account has no token ${input.params.id}.`)
  },
})
