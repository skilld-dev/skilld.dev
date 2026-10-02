import { tokensV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentIssuedToken } from '../../../../presenters/account-v1'
import { issuePersonalToken, loadCliTokenKind } from '../../../../utils/cli-tokens'

export default defineApiOperation({
  operation: tokensV1.operations.create,
  handler: async ({ event, platform, input, user }) => {
    // A GitHub Actions token lasts one hour. Minting a token with it would let
    // a compromised workflow keep account access after the job ends.
    const callerTokenId = event.context.cliTokenId as number | undefined
    if (callerTokenId !== undefined && await loadCliTokenKind(platform.db, user.id, callerTokenId) === 'oidc')
      return operationFailure('FORBIDDEN', 'A GitHub Actions token cannot create a token. Create one at skilld.dev/me/cli-tokens/new.')
    const { label, ttlDays } = input.body
    return presentIssuedToken(await issuePersonalToken(event, user.id, { label, ttlDays }), { label, ttlDays })
  },
})
