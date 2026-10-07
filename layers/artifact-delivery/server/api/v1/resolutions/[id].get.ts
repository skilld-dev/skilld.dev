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
import { privateArtifactAccessEnabled } from '../../../utils/private-feature'
import { waitForResolutionChange } from '../../../utils/resolution-wait'
import { setSkillPageUrlHeader } from '../../../utils/skill-page'
import { getResolution } from '../../../utils/state'

export default withArtifactProblems(defineApiHandler({
  response: resolutionSchema,
  async handler({ event, platform, user }) {
    setHeader(event, 'cache-control', 'private, no-store')
    const resolutionId = resolutionIdSchema.safeParse(getRouterParam(event, 'id'))
    if (!resolutionId.success)
      throw createError({ statusCode: 404, message: 'Resolution not found' })
    const row = await getResolution(platform.db, resolutionId.data)
    if (!row)
      throw createError({ statusCode: 404, message: 'Resolution not found' })
    if (row.visibility === 'private') {
      if (!privateArtifactAccessEnabled(platform.env))
        throw createError({ statusCode: 404, message: 'Resolution not found' })
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
    // A building Resolution answers when its state changes, so the CLI sees
    // each stage, and the finished build, within one check of it landing.
    const current = await waitForResolutionChange({
      load: () => getResolution(platform.db, row.id),
      sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
      now: Date.now,
    }, row)
    await setSkillPageUrlHeader(event, current)
    return current
  },
  presenter: presentArtifactResolution,
}))
