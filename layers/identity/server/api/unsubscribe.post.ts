import { defineApiHandler } from '#shared/server/handler'
import { UnsubQuery } from '../schemas/unsubscribe'
import { verifyUnsubToken } from '../utils/email'
import { applyUnsubscribe, renderUnsubscribePage } from '../utils/unsubscribe'

// RFC 8058 one-click POST. Token comes from the query string (per the
// `List-Unsubscribe` header URL), not the body — we parse query directly
// rather than relying on the schema's body path.
export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const config = useRuntimeConfig(event)
    const contentType = getHeader(event, 'content-type') ?? ''
    const rawForm = contentType.includes('application/x-www-form-urlencoded')
      ? await readBody<unknown>(event)
      : {}
    const form = typeof rawForm === 'object' && rawForm !== null ? rawForm : {}
    const parsed = UnsubQuery.safeParse(Object.assign({}, getQuery(event), form))
    if (!parsed.success) {
      setResponseStatus(event, 400)
      setHeader(event, 'content-type', 'text/html; charset=utf-8')
      return renderUnsubscribePage({ _tag: 'invalid' })
    }
    const userId = await verifyUnsubToken(parsed.data.t, config.tokenKey as string, parsed.data.list === 'welcome' ? 'welcome' : 'recurring')
    if (!userId) {
      setResponseStatus(event, 400)
      setHeader(event, 'content-type', 'text/html; charset=utf-8')
      return renderUnsubscribePage({ _tag: 'invalid' })
    }
    await applyUnsubscribe(platform.db, userId, parsed.data.list)
    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    setHeader(event, 'cache-control', 'private, no-store')
    return renderUnsubscribePage({
      _tag: 'complete',
      token: parsed.data.t,
      list: parsed.data.list,
      action: 'unsubscribed',
    })
  },
})
