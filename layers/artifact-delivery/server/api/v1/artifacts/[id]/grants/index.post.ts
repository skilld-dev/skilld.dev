import { getHeader, getRouterParam, setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { artifactIdSchema, publicArtifactGrantSchema } from '../../../../../schemas/contracts'
import { withArtifactProblems } from '../../../../../utils/artifact-problem'
import { createPublicArtifactGrant } from '../../../../../utils/grant'
import { parseTrustedRoot } from '../../../../../utils/trusted-root'

export default withArtifactProblems(defineApiHandler({
  response: publicArtifactGrantSchema,
  async handler({ event, platform }) {
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
    const result = await createPublicArtifactGrant({
      db: platform.db,
      trustedRoot: parseTrustedRoot(platform.env.ARTIFACT_TRUSTED_ROOT_JSON, now),
      publicBaseUrl: platform.env.ARTIFACT_PUBLIC_BASE_URL,
      now,
    }, artifactId.data)
    if (result._tag === 'not-found')
      throw createError({ statusCode: 404, message: 'Artifact not found' })
    if (result._tag === 'denied') {
      throw createError({
        statusCode: 409,
        message: 'Artifact delivery is not available',
        data: { code: result.code },
      })
    }
    setHeader(event, 'cache-control', 'private, no-store')
    return result.grant
  },
}))
