import { defineApiHandler } from '#shared/server/handler'
import { authSessionEvent } from '#shared/server/session-access'
import { clearGithubUserCredentials } from '../../utils/users'

export default defineApiHandler({
  handler: async ({ event, platform, session }) => {
    const userId = (session?.user as { id?: number } | undefined)?.id
    if (typeof userId === 'number')
      await clearGithubUserCredentials(platform.db, userId)
    await clearUserSession(authSessionEvent(event))
    return { ok: true as const }
  },
})
