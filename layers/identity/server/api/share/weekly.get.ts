import { defineApiHandler } from '#shared/server/handler'

/** Fixed share destination. No caller-controlled redirect is accepted. */
export default defineApiHandler({
  handler: async ({ event }) => {
    const boardUrl = 'https://skilld.dev/skills/trending'
    const params = new URLSearchParams({
      text: 'Skills worth a look this week',
      url: boardUrl,
    })
    setHeader(event, 'cache-control', 'private, no-store')
    return sendRedirect(event, `https://bsky.app/intent/compose?${params.toString()}`, 302)
  },
})
