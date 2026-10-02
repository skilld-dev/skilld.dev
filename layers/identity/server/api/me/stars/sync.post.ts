import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { StarsSyncQuery } from '../../../schemas/stars'
import { importStarredPage } from '../../../utils/starred-repos'
import { requireGithubUserToken, requireUserRow } from '../../../utils/users'

export default defineApiHandler({
  schema: StarsSyncQuery,
  policy: [authenticated],
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    const config = useRuntimeConfig(event)
    const githubToken = await requireGithubUserToken(platform.db, u.id, config.tokenKey as string)

    const result = await importStarredPage({ db: platform.db, userId: u.id, githubToken, page: body.page })
    if (result._tag === 'GithubSignInRequired')
      throw createError({ statusCode: 401, statusMessage: 'GitHub sign-in required', message: 'GitHub rejected your access. Sign in with GitHub again.' })
    if (result._tag === 'GithubFailed')
      throw createError({ statusCode: 502, message: `GitHub error ${result.status}` })

    return {
      ok: true as const,
      page: result.page,
      fetched: result.fetched,
      total: result.total,
      matched: result.matched,
      hasMore: result.hasMore,
      syncedAt: result.importedAt,
    }
  },
})
