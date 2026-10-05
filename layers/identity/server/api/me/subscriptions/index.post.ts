import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { SubscriptionsCreateInput } from '../../../schemas/subscriptions'
import { requireUserRow } from '../../../utils/users'
import { createRepositoryWatches } from '../../../utils/watches'

export default defineApiHandler({
  schema: SubscriptionsCreateInput,
  policy: [authenticated],
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    if (!body.repos.length)
      return { ok: true as const, inserted: 0 }
    const inserted = await createRepositoryWatches(platform.db, u.id, body.repos, body.source)
    return { ok: true as const, inserted }
  },
})
