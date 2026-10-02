import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { loadCliTokens } from '../../../utils/cli-tokens'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, user }) => ({ items: await loadCliTokens(event.context.platform.db, user!.id) }),
})
