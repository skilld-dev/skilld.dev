import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { starsImportPresenter } from '../../../presenters/user'
import { StarsSyncQuery } from '../../../schemas/stars'
import { importStarredPage } from '../../../utils/starred-repos'
import { requireGithubUserToken, requireUserRow } from '../../../utils/users'

export default defineApiHandler({
  schema: StarsSyncQuery,
  policy: [authenticated],
  presenter: starsImportPresenter,
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    const config = useRuntimeConfig(event)
    const githubToken = await requireGithubUserToken(platform.db, u.id, config.tokenKey as string)

    const result = await importStarredPage({ db: platform.db, userId: u.id, githubToken, page: body.page, importId: body.importId })
    if (result._tag === 'ImportRestartRequired')
      throw createError({ statusCode: 409, message: 'Another star import started. Import your stars again.' })
    if (result._tag === 'GithubInvalidResponse')
      throw createError({ statusCode: 502, message: 'Could not import GitHub stars. Try again.' })
    if (result._tag === 'GithubSignInRequired')
      throw createError({ statusCode: 401, statusMessage: 'GitHub sign-in required', message: 'GitHub rejected your access. Sign in with GitHub again.' })
    if (result._tag === 'GithubFailed')
      throw createError({ statusCode: 502, message: `GitHub error ${result.status}` })

    return result
  },
})
