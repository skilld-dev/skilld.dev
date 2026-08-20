import { deleteCookie, getCookie, sendRedirect, setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { githubConnectionCallbackSchema } from '../../../../schemas/github-connections'
import {
  createGithubAppClientFromEnv,
  exchangeGithubAppUserCode,
  githubAppUserTokenDependenciesFromEnv,
  storeAccountGithubAppUserAuthorization,
} from '../../../../utils/github-app'
import {
  GITHUB_CONNECTION_RETURN_COOKIE,
  GITHUB_CONNECTION_STATE_COOKIE,
  githubConnectionReturnTo,
  githubConnectionStateMatches,
} from '../../../../utils/github-connection-flow'
import { connectGithubInstallation } from '../../../../utils/private-access'

const COOKIE_PATH = '/api/v1/github/connections'

export default defineApiHandler({
  schema: githubConnectionCallbackSchema,
  requireAuth: true,
  async handler({ body, event, platform, user }) {
    const expectedState = getCookie(event, GITHUB_CONNECTION_STATE_COOKIE)
    if (!githubConnectionStateMatches(expectedState, body.state))
      throw createError({ statusCode: 400, message: 'GitHub App connection expired' })
    const returnTo = githubConnectionReturnTo(
      getCookie(event, GITHUB_CONNECTION_RETURN_COOKIE),
    )
    deleteCookie(event, GITHUB_CONNECTION_STATE_COOKIE, { path: COOKIE_PATH })
    deleteCookie(event, GITHUB_CONNECTION_RETURN_COOKIE, { path: COOKIE_PATH })

    const accountId = user!.id
    const account = await platform.db.prepare(
      'SELECT github_id FROM users WHERE id = ?1 LIMIT 1',
    ).bind(accountId).first<{ github_id: number }>()
    if (!account)
      throw createError({ statusCode: 401, message: 'Account not found' })
    const tokenDependencies = githubAppUserTokenDependenciesFromEnv(platform.env)
    const authorization = await exchangeGithubAppUserCode(body.code, tokenDependencies)
    if (authorization._tag === 'rejected')
      throw createError({ statusCode: 403, message: 'GitHub App authorization failed' })
    if (authorization.githubUserId !== account.github_id)
      throw createError({ statusCode: 403, message: 'Use the GitHub Account signed in to skilld' })

    const selected = await createGithubAppClientFromEnv(platform.env)
      .selectedRepositoriesForUser(authorization.accessToken, body.installation_id)
    if (selected._tag === 'not-found')
      throw createError({ statusCode: 404, message: 'GitHub App installation not found' })
    await storeAccountGithubAppUserAuthorization(
      platform.db,
      accountId,
      authorization,
      tokenDependencies,
    )
    const connection = await connectGithubInstallation(platform.db, accountId, {
      installationId: selected.installationId,
      githubAccountId: selected.githubAccountId,
      repositories: selected.repositories,
    }, Math.floor(Date.now() / 1000))
    if (connection._tag === 'not-found')
      throw createError({ statusCode: 404, message: 'GitHub App installation not found' })
    setHeader(event, 'cache-control', 'private, no-store')
    return sendRedirect(event, returnTo)
  },
})
