import { defineApiHandler } from '#shared/server/handler'
import { clearGithubUserCredentials } from '../../utils/users'

export default defineApiHandler({
  handler: async ({ event, platform, session }) => {
    const userId = (session?.user as { id?: number } | undefined)?.id
    if (typeof userId === 'number')
      await clearGithubUserCredentials(platform.db, userId)
    await clearUserSession(event)
    return { ok: true as const }
  },
})
