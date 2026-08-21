import { setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import {
  updatePlansRequestSchema,
  updatePlansResponseSchema,
} from '../../schemas/update-plans'
import {
  createGithubAppClientFromEnv,
  githubAppUserTokenDependenciesFromEnv,
  loadAccountGithubAppUserToken,
} from '../../utils/github-app'
import { findPrivateRepositoryAccess } from '../../utils/private-access'
import { privateArtifactAccessEnabled } from '../../utils/private-feature'
import { createGithubUpdatePlans } from '../../utils/update-plans'

export default defineApiHandler({
  schema: updatePlansRequestSchema,
  response: updatePlansResponseSchema,
  requireAuth: true,
  async handler({ body, event, platform, user }) {
    setHeader(event, 'cache-control', 'private, no-store')
    if (!privateArtifactAccessEnabled(platform.env))
      throw createError({ statusCode: 404, message: 'Update plans not found' })

    const accountId = user!.id
    const githubApp = createGithubAppClientFromEnv(platform.env)
    const results = await createGithubUpdatePlans(body.comparisons, {
      findAccess: (owner, repository) => findPrivateRepositoryAccess(
        platform.db,
        accountId,
        owner,
        repository,
      ),
      loadUserToken: () => loadAccountGithubAppUserToken(
        platform.db,
        accountId,
        githubAppUserTokenDependenciesFromEnv(platform.env),
      ),
      githubApp,
      fetch,
      cache: {
        get: (key, type) => platform.env.KV_CACHE.get(key, type),
        put: (key, value, options) => platform.env.KV_CACHE.put(key, value, options),
      },
      now: () => Date.now(),
      reportFailure(operation) {
        emitOperationalEvent(createWideEvent({
          operation: `update-plans-${operation}`,
          outcome: 'failed',
        }))
      },
    })

    return { results }
  },
})
