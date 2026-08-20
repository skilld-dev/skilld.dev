import { getHeader, setHeader, setResponseStatus } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { presentArtifactResolution } from '../../../presenters/resolution'
import {
  createResolutionRequestSchema,
  createResolutionResponseSchema,
  problemCodeSchema,
} from '../../../schemas/contracts'
import { withArtifactProblems } from '../../../utils/artifact-problem'
import { enqueueArtifactBuild } from '../../../utils/queue'
import {
  createResolution,
  resolutionRequestIdentity,
} from '../../../utils/state'

export default withArtifactProblems(defineApiHandler({
  schema: createResolutionRequestSchema,
  response: createResolutionResponseSchema,
  async handler({ body, event, platform }) {
    const idempotencyKey = getHeader(event, 'idempotency-key')
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw createError({
        statusCode: 400,
        message: 'Idempotency-Key must contain 16 to 200 characters',
        data: { code: 'INVALID_SOURCE' },
      })
    }
    const identity = await resolutionRequestIdentity(body.source, idempotencyKey)
    const result = await createResolution(
      platform.db,
      body.source,
      identity,
      Math.floor(Date.now() / 1000),
    )
    if (result._tag === 'idempotency-conflict') {
      throw createError({
        statusCode: 409,
        message: 'Idempotency-Key already belongs to another request',
        data: { code: 'INVALID_SOURCE' },
      })
    }
    if (result.row.state === 'blocked') {
      throw createError({
        statusCode: 409,
        message: 'Artifact checks blocked delivery',
        data: { code: 'CHECK_BLOCKED' },
      })
    }
    if (result.row.state === 'revoked') {
      throw createError({
        statusCode: 409,
        message: 'Artifact delivery was revoked',
        data: { code: 'ARTIFACT_REVOKED' },
      })
    }
    if (result.row.state === 'failed') {
      throw createError({
        statusCode: 503,
        message: 'Artifact creation failed',
        data: { code: problemCodeSchema.parse(result.row.error_code) },
      })
    }
    if (result.row.state === 'requested')
      await enqueueArtifactBuild(platform.env, result.row.id)

    const response = presentArtifactResolution(result.row)
    setResponseStatus(event, response.state === 'pending' ? 202 : 200)
    setHeader(event, 'cache-control', 'private, no-store')
    if (response.state === 'pending')
      setHeader(event, 'retry-after', 1)
    return result.row
  },
  presenter: presentArtifactResolution,
}))
