import { tokensV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { presentTokens } from '../../../../presenters/account-v1'
import { loadCliTokens } from '../../../../utils/cli-tokens'

export default defineApiOperation({
  operation: tokensV1.operations.list,
  handler: async ({ platform, input, user }) => presentTokens(await loadCliTokens(platform.db, user.id), {
    // Set only when a skilld token sent the request, never for a browser sign-in.
    currentTokenId: typeof user.cliTokenId === 'number' ? user.cliTokenId : null,
    now: Math.floor(Date.now() / 1000),
    page: input.query,
  }),
})
