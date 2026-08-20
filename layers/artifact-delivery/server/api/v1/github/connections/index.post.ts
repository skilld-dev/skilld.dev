import { setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import {
  createGithubConnectionSchema,
  githubConnectionSchema,
} from '../../../../schemas/github-connections'
import {
  createGithubAppClientFromEnv,
  githubUserTokenDependenciesFromEnv,
  loadAccountGithubUserToken,
} from '../../../../utils/github-app'
import { connectGithubInstallation } from '../../../../utils/private-access'

export default defineApiHandler({
  schema: createGithubConnectionSchema,
  response: githubConnectionSchema,
  requireAuth: true,
  async handler({ body, event, platform, user }) {
    const accountId = user!.id
    const userToken = await loadAccountGithubUserToken(
      platform.db,
      accountId,
      githubUserTokenDependenciesFromEnv(platform.env),
    )
    if (!userToken)
      throw createError({ statusCode: 404, message: 'GitHub App installation not found' })
    const selected = await createGithubAppClientFromEnv(platform.env)
      .selectedRepositoriesForUser(userToken, body.installationId)
    if (selected._tag === 'not-found')
      throw createError({ statusCode: 404, message: 'GitHub App installation not found' })
    const connection = await connectGithubInstallation(platform.db, accountId, {
      installationId: selected.installationId,
      githubAccountId: selected.githubAccountId,
      repositories: selected.repositories,
    }, Math.floor(Date.now() / 1000))
    if (connection._tag === 'not-found')
      throw createError({ statusCode: 404, message: 'GitHub App installation not found' })
    setHeader(event, 'cache-control', 'private, no-store')
    return {
      installationId: connection.installationId,
      repositoryCount: connection.repositoryCount,
      state: connection.state,
    }
  },
})
