import type { H3Event } from 'h3'
import { getHeader, setHeader, setResponseStatus } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { presentArtifactResolution } from '../../../presenters/resolution'
import {
  createResolutionRequestSchema,
  createResolutionResponseSchema,
  problemCodeSchema,
} from '../../../schemas/contracts'
import { withArtifactProblems } from '../../../utils/artifact-problem'
import { failResolution } from '../../../utils/build'
import { findPrivateRepositoryAccess } from '../../../utils/private-access'
import { privateArtifactAccessEnabled } from '../../../utils/private-feature'
import { enqueueArtifactBuild } from '../../../utils/queue'
import { enqueueAfterResponse, fetchAdmittedSkillIdentity, requestResolution } from '../../../utils/request-resolution'
import { setSkillPageUrlHeader } from '../../../utils/skill-page'
import { getResolution } from '../../../utils/state'

export default withArtifactProblems(defineApiHandler({
  schema: createResolutionRequestSchema,
  response: createResolutionResponseSchema,
  async handler({ body, event, platform, user }) {
    const idempotencyKey = getHeader(event, 'idempotency-key')
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw createError({
        statusCode: 400,
        message: 'Idempotency-Key must contain 16 to 200 characters',
        data: { code: 'INVALID_SOURCE' },
      })
    }
    const privateAccess = user?.id && privateArtifactAccessEnabled(platform.env)
      ? await findPrivateRepositoryAccess(
          platform.db,
          user.id,
          body.source.owner,
          body.source.repository,
        )
      : { _tag: 'not-found' as const }
    const result = await requestResolution({
      db: platform.db,
      lookupAdmitted: fetchAdmittedSkillIdentity(event.context),
      enqueue: enqueueAfterResponse({
        schedule: work => runAfterResponse(event, work),
        enqueue: resolutionId => enqueueArtifactBuild(platform.env, resolutionId),
        failUnqueued: async (resolutionId, error) => {
          console.error(JSON.stringify({
            operation: 'artifact-build',
            outcome: 'enqueue-failed',
            resolutionId,
            error: error instanceof Error ? error.message : String(error),
          }))
          const row = await getResolution(platform.db, resolutionId)
          if (row)
            await failResolution({ db: platform.db, now: () => Math.floor(Date.now() / 1000) }, row, 'SERVICE_UNAVAILABLE', true)
        },
      }),
      now: () => Math.floor(Date.now() / 1000),
    }, {
      source: body.source,
      idempotencyKey,
      access: privateAccess._tag === 'allowed'
        ? {
            visibility: 'private',
            accountId: privateAccess.accountId,
            installationId: privateAccess.installationId,
            repositoryId: privateAccess.repositoryId,
          }
        : { visibility: 'public' },
      requesterAccountId: user?.id ?? null,
    })
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
    const response = presentArtifactResolution(result.row)
    setResponseStatus(event, response.state === 'pending' ? 202 : 200)
    setHeader(event, 'cache-control', 'private, no-store')
    await setSkillPageUrlHeader(event, result.row)
    if (response.state === 'pending')
      setHeader(event, 'retry-after', 1)
    return result.row
  },
  presenter: presentArtifactResolution,
}))

/**
 * Keep the queue send alive past the response on Workers.
 *
 * H3Event has no `waitUntil` on h3 1.15, so the send goes through the
 * Cloudflare context Nitro mounts. Off Workers (local dev, tests) it does not
 * block the response. The registry layer keeps the same helper, and ADR-0001
 * keeps utilities out of other layers, so this route holds its own copy.
 */
function runAfterResponse(event: H3Event, promise: Promise<unknown>): void {
  const ctx = (event.context as { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } }).cloudflare?.context
  if (ctx?.waitUntil) {
    ctx.waitUntil(promise)
    return
  }
  void promise
}
