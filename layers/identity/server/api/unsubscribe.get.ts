import { defineApiHandler } from '#shared/server/handler'
import { UnsubQuery } from '../schemas/unsubscribe'
import { verifyUnsubToken } from '../utils/email'
import { renderUnsubscribePage } from '../utils/unsubscribe'

export default defineApiHandler({
  schema: UnsubQuery,
  handler: async ({ event, body }) => {
    const config = useRuntimeConfig(event)
    const userId = await verifyUnsubToken(body.t, config.tokenKey as string)
    if (!userId) {
      setResponseStatus(event, 400)
      setHeader(event, 'content-type', 'text/html; charset=utf-8')
      return renderUnsubscribePage({ _tag: 'invalid' })
    }

    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    setHeader(event, 'cache-control', 'private, no-store')
    return renderUnsubscribePage({ _tag: 'confirm', token: body.t, list: body.list })
  },
})
