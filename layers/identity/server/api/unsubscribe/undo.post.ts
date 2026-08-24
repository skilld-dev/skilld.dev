import { defineApiHandler } from '#shared/server/handler'
import { UnsubQuery } from '../../schemas/unsubscribe'
import { verifyUnsubToken } from '../../utils/email'
import { applyResubscribe, renderUnsubscribePage } from '../../utils/unsubscribe'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const contentType = getHeader(event, 'content-type') ?? ''
    const rawForm = contentType.includes('application/x-www-form-urlencoded')
      ? await readBody<unknown>(event)
      : {}
    const form = typeof rawForm === 'object' && rawForm !== null ? rawForm : {}
    const parsed = UnsubQuery.safeParse(Object.assign({}, getQuery(event), form))
    const config = useRuntimeConfig(event)
    const userId = parsed.success
      ? await verifyUnsubToken(parsed.data.t, config.tokenKey as string)
      : null
    if (!parsed.success || !userId) {
      setResponseStatus(event, 400)
      setHeader(event, 'content-type', 'text/html; charset=utf-8')
      return renderUnsubscribePage({ _tag: 'invalid' })
    }

    await applyResubscribe(platform.db, userId, parsed.data.list)
    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    setHeader(event, 'cache-control', 'private, no-store')
    return renderUnsubscribePage({
      _tag: 'complete',
      token: parsed.data.t,
      list: parsed.data.list,
      action: 'restored',
    })
  },
})
