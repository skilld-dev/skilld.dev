import { getHeader, getRouterParam, setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { artifactGrantSchema, artifactIdSchema } from '../../../../../schemas/contracts'
import { withArtifactProblems } from '../../../../../utils/artifact-problem'
import {
  createGithubAppClientFromEnv,
  loadAccountGithubUserToken,
} from '../../../../../utils/github-app'
import { createPublicArtifactGrant } from '../../../../../utils/grant'
import { createPrivateArtifactGrant } from '../../../../../utils/private-grant'
import { parseTrustedRoot } from '../../../../../utils/trusted-root'

export default withArtifactProblems(defineApiHandler({
  response: artifactGrantSchema,
  async handler({ event, platform, user }) {
    const artifactId = artifactIdSchema.safeParse(getRouterParam(event, 'id'))
    if (!artifactId.success)
      throw createError({ statusCode: 404, message: 'Artifact not found' })
    const idempotencyKey = getHeader(event, 'idempotency-key')
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw createError({
        statusCode: 400,
        message: 'Idempotency-Key must contain 16 to 200 characters',
        data: { code: 'INVALID_SOURCE' },
      })
    }
    const now = Math.floor(Date.now() / 1000)
    const trustedRoot = parseTrustedRoot(platform.env.ARTIFACT_TRUSTED_ROOT_JSON, now)
    const publicResult = await createPublicArtifactGrant({
      db: platform.db,
      trustedRoot,
      publicBaseUrl: platform.env.ARTIFACT_PUBLIC_BASE_URL,
      now,
    }, artifactId.data)
    if (publicResult._tag === 'granted') {
      setHeader(event, 'cache-control', 'private, no-store')
      return publicResult.grant
    }
    if (publicResult._tag === 'denied') {
      throw createError({
        statusCode: 409,
        message: 'Artifact delivery is not available',
        data: { code: publicResult.code },
      })
    }

    if (!user?.id)
      throw createError({ statusCode: 404, message: 'Artifact not found' })
    const userToken = await loadAccountGithubUserToken(
      platform.db,
      user.id,
      platform.env.NUXT_TOKEN_KEY,
    )
    if (!userToken)
      throw createError({ statusCode: 404, message: 'Artifact not found' })
    const githubApp = createGithubAppClientFromEnv(platform.env)
    const privateResult = await createPrivateArtifactGrant({
      db: platform.db,
      trustedRoot,
      contentBaseUrl: platform.env.ARTIFACT_PRIVATE_BASE_URL,
      now,
      recheckAccess: access => githubApp.userCanAccessRepository(
        userToken,
        access.installationId,
        access.repositoryId,
      ),
    }, user.id, artifactId.data)
    if (privateResult._tag === 'not-found')
      throw createError({ statusCode: 404, message: 'Artifact not found' })
    if (privateResult._tag === 'denied') {
      throw createError({
        statusCode: 409,
        message: 'Artifact delivery is not available',
        data: { code: privateResult.code },
      })
    }
    setHeader(event, 'cache-control', 'private, no-store')
    return privateResult.grant
  },
}))
