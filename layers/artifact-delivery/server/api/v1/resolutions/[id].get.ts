import { getRouterParam, setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { presentArtifactResolution } from '../../../presenters/resolution'
import { resolutionIdSchema, resolutionSchema } from '../../../schemas/contracts'
import { withArtifactProblems } from '../../../utils/artifact-problem'
import {
  createGithubAppClientFromEnv,
  githubAppUserTokenDependenciesFromEnv,
  loadAccountGithubAppUserToken,
} from '../../../utils/github-app'
import { canReadPrivateResolution } from '../../../utils/private-access'
import { getResolution } from '../../../utils/state'

export default withArtifactProblems(defineApiHandler({
  response: resolutionSchema,
  async handler({ event, platform, user }) {
    const resolutionId = resolutionIdSchema.safeParse(getRouterParam(event, 'id'))
    if (!resolutionId.success)
      throw createError({ statusCode: 404, message: 'Resolution not found' })
    const row = await getResolution(platform.db, resolutionId.data)
    if (!row)
      throw createError({ statusCode: 404, message: 'Resolution not found' })
    if (row.visibility === 'private') {
      if (!user?.id)
        throw createError({ statusCode: 404, message: 'Resolution not found' })
      const userToken = await loadAccountGithubAppUserToken(
        platform.db,
        user.id,
        githubAppUserTokenDependenciesFromEnv(platform.env),
      )
      const githubApp = createGithubAppClientFromEnv(platform.env)
      if (
        !userToken
        || !await canReadPrivateResolution(
          platform.db,
          user.id,
          row.id,
          access => githubApp.userCanAccessRepository(
            userToken,
            access.installationId,
            access.repositoryId,
          ),
        )
      ) {
        throw createError({ statusCode: 404, message: 'Resolution not found' })
      }
    }
    setHeader(event, 'cache-control', 'private, no-store')
    return row
  },
  presenter: presentArtifactResolution,
}))
