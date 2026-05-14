import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { revokeSession } from '../../utils/cli-tokens'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, user }) => {
    const tokenId = (user as { cliTokenId?: number } | null)?.cliTokenId ?? event.context.cliTokenId
    if (typeof tokenId === 'number')
      await revokeSession(event, tokenId)
    return { ok: true as const }
  },
})
