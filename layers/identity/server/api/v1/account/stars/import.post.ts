import { starsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentStarsImport } from '../../../../presenters/account-v1'
import { importStarredPage } from '../../../../utils/starred-repos'
import { requireGithubUserToken } from '../../../../utils/users'

export default defineApiOperation({
  operation: starsV1.operations.import,
  handler: async ({ event, platform, input, user }) => {
    // Throws the 401 that asks for a new GitHub sign-in when no token is stored.
    const githubToken = await requireGithubUserToken(platform.db, user.id, useRuntimeConfig(event).tokenKey as string)
    const result = await importStarredPage({ db: platform.db, userId: user.id, githubToken, page: input.body.page })
    if (result._tag === 'GithubSignInRequired')
      return operationFailure('AUTH_REQUIRED', 'GitHub rejected skilld\'s access to your account. Sign in on skilld.dev again.')
    // SERVICE_UNAVAILABLE is implicit, so no handler returns it as a value:
    // a thrown 503 maps onto it, and the adapter logs the GitHub status.
    if (result._tag === 'GithubFailed')
      throw createError({ statusCode: 503, message: `GitHub answered ${result.status} to the star import` })
    return presentStarsImport(result)
  },
})
