import type { EventHandler, EventHandlerRequest } from 'h3'
import type { ArtifactProblem, ProblemCode } from '../schemas/contracts'
import { defineEventHandler, setHeader, setResponseStatus } from 'h3'
import { problemCodeSchema, problemSchema } from '../schemas/contracts'

const problemTitles: Record<ProblemCode, string> = {
  AUTH_REQUIRED: 'Authentication required',
  INVALID_SOURCE: 'Invalid Artifact source',
  SOURCE_NOT_FOUND: 'Artifact source not found',
  SOURCE_ACCESS_DENIED: 'Artifact source access denied',
  SOURCE_UNAVAILABLE: 'Artifact source unavailable',
  RATE_LIMITED: 'Request rate limited',
  CHECK_BLOCKED: 'Artifact checks blocked delivery',
  CHECK_UNAVAILABLE: 'Artifact checks unavailable',
  ARTIFACT_REVOKED: 'Artifact revoked',
  ARTIFACT_EXPIRED: 'Artifact expired',
  ATTESTATION_EXPIRED: 'Artifact attestation expired',
  SIGNER_UNAVAILABLE: 'Artifact signer unavailable',
  SERVICE_UNAVAILABLE: 'Artifact service unavailable',
}

export function withArtifactProblems(
  handler: EventHandler<EventHandlerRequest, Promise<unknown>>,
): EventHandler<EventHandlerRequest, Promise<unknown>> {
  return defineEventHandler(async (event) => {
    const outcome = await Promise.resolve(handler(event))
      .then(value => ({ _tag: 'ok' as const, value }))
      .catch(error => ({ _tag: 'error' as const, error }))
    if (outcome._tag === 'ok')
      return outcome.value

    const problem = createArtifactProblem(outcome.error, event.path)
    setResponseStatus(event, problem.status)
    setHeader(event, 'content-type', 'application/problem+json')
    setHeader(event, 'cache-control', 'private, no-store')
    return problem
  })
}

export function createArtifactProblem(error: unknown, instance: string): ArtifactProblem {
  const record = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : {}
  const data = typeof record.data === 'object' && record.data !== null
    ? record.data as Record<string, unknown>
    : {}
  const requestedStatus = typeof record.statusCode === 'number'
    ? record.statusCode
    : typeof record.status === 'number' ? record.status : 500
  const status = requestedStatus >= 500
    ? 503
    : requestedStatus >= 400 ? Math.floor(requestedStatus) : 503
  const declaredCode = problemCodeSchema.safeParse(data.code)
  const code = declaredCode.success ? declaredCode.data : problemCodeForStatus(status)
  const message = typeof record.message === 'string' ? record.message : null
  return problemSchema.parse({
    type: `https://skilld.dev/problems/${code.toLowerCase().replaceAll('_', '-')}`,
    title: problemTitles[code],
    status,
    detail: status < 500 && message ? message.slice(0, 1000) : undefined,
    instance,
    code,
  })
}

function problemCodeForStatus(status: number): ProblemCode {
  if (status === 401)
    return 'AUTH_REQUIRED'
  if (status === 404)
    return 'SOURCE_NOT_FOUND'
  if (status === 429)
    return 'RATE_LIMITED'
  if (status >= 500)
    return 'SERVICE_UNAVAILABLE'
  return 'INVALID_SOURCE'
}
