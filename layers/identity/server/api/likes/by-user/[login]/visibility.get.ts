import { defineApiHandler } from '#shared/server/handler'
import { lookupLikedList } from '../../../../utils/liked-list-access'

/**
 * Lets a profile page decide whether to link to /@login/liked without loading
 * the list. A private list returns 404 to everyone except its owner.
 */
export default defineApiHandler({
  handler: async ({ event, platform, user }) => {
    const login = getRouterParam(event, 'login')
    if (!login)
      throw createError({ statusCode: 400, message: 'Missing login' })

    // The answer depends on the viewer, so no shared cache may keep it.
    setHeader(event, 'cache-control', 'private, no-store')

    const lookup = await lookupLikedList(platform.db, login, user?.id ?? null)
    if (lookup._tag === 'not_found')
      throw createError({ statusCode: 404, message: 'Not found' })

    return { access: lookup.access }
  },
})
