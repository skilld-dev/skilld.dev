import { defineApiHandler } from '#shared/server/handler'
import { UnsubQuery } from '../schemas/unsubscribe'
import { verifyUnsubToken } from '../utils/email'
import { applyUnsubscribe } from '../utils/unsubscribe'

export default defineApiHandler({
  schema: UnsubQuery,
  handler: async ({ event, body, platform }) => {
    const config = useRuntimeConfig(event)
    const userId = await verifyUnsubToken(body.t, config.tokenKey as string)
    if (!userId) {
      setResponseStatus(event, 400)
      return 'Invalid unsubscribe link.'
    }

    const outcome = await applyUnsubscribe(platform.db, userId, body.list)

    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    return `<!doctype html><meta charset=utf-8><title>Unsubscribed</title>
<div style="font-family:sans-serif;max-width:480px;margin:64px auto;padding:24px;border:1px solid #e7e5e4;border-radius:8px;">
<h1 style="margin:0 0 8px 0;font-size:20px;">${outcome.heading}</h1>
<p style="color:#78716c;">${outcome.body} You can turn it back on any time from <a href="/me">your dashboard</a>.</p>
</div>`
  },
})
