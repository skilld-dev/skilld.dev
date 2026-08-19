import { defineApiHandler } from '#shared/server/handler'
import { UnsubQuery } from '../schemas/unsubscribe'
import { verifyUnsubToken } from '../utils/email'
import { applyUnsubscribe } from '../utils/unsubscribe'

// RFC 8058 one-click POST. Token comes from the query string (per the
// `List-Unsubscribe` header URL), not the body — we parse query directly
// rather than relying on the schema's body path.
export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const config = useRuntimeConfig(event)
    const parsed = UnsubQuery.safeParse(getQuery(event))
    if (!parsed.success) {
      setResponseStatus(event, 400)
      return { ok: false as const }
    }
    const userId = await verifyUnsubToken(parsed.data.t, config.tokenKey as string)
    if (!userId) {
      setResponseStatus(event, 400)
      return { ok: false as const }
    }
    await applyUnsubscribe(platform.db, userId, parsed.data.list)
    return { ok: true as const }
  },
})
