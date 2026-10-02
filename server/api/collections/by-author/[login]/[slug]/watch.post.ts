import { authenticated } from '~~/server/policies/authenticated'
import { watchCollection } from '~~/server/utils/collections'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform, user }) => {
    const login = getRouterParam(event, 'login')
    const slug = getRouterParam(event, 'slug')
    if (!login || !slug)
      throw createError({ statusCode: 400, message: 'Missing login or slug' })

    // An unknown collection answers ok with nothing watched, as it always has.
    const outcome = await watchCollection(platform.db, user!.id, login, slug)
    return { ok: true as const, count: outcome._tag === 'Watched' ? outcome.repositories : 0 }
  },
})
