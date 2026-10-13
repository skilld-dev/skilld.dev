import { loadCuratorProfile } from '~~/server/utils/collections'
import { defineApiHandler } from '#shared/server/handler'

/**
 * The skilld.dev account behind `/@<login>`, or 404 when no account has the
 * login. The profile page reads it to tell an Author apart from a made-up URL.
 */
export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    const profile = login ? await loadCuratorProfile(platform.db, login) : null
    if (!profile)
      throw createError({ statusCode: 404, message: 'No skilld.dev account has this login' })
    return { login: profile.login }
  },
})
