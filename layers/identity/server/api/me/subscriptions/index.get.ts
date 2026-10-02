import { defineApiHandler } from '#shared/server/handler'
import { identitySubscriptionsSchema } from '../../../../shared/contracts/account'
import { authenticated } from '../../../policies/authenticated'
import { requireUserRow } from '../../../utils/users'
import { loadWatches } from '../../../utils/watches'

export default defineApiHandler({
  policy: [authenticated],
  response: identitySubscriptionsSchema,
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    return { items: await loadWatches(platform.db, u.id) }
  },
})
