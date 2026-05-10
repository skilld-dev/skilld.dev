import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  handler: async ({ event }) => {
    await clearUserSession(event)
    return { ok: true as const }
  },
})
