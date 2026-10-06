import type { H3EventContext } from 'h3'
import type { SourceRequest } from '../schemas/contracts'
import type { FetchAdmittedSkillIdentity } from './admitted-identity'
import type { ArtifactBuildOutcome } from './build'
import type { CreateResolutionResult } from './state'
import { admittedSourceRequest } from './admitted-identity'
import { createResolution, resolutionRequestIdentity } from './state'

export interface ResolutionRequestDependencies {
  db: D1Database
  /** Ask the registry for the identity it admitted under a public name. */
  lookupAdmitted: FetchAdmittedSkillIdentity
  enqueue: (resolutionId: string) => Promise<void>
  now: () => number
}

export type ResolutionAccess
  = | { visibility: 'public' }
    | {
      visibility: 'private'
      accountId: number
      installationId: number
      repositoryId: number
    }

/**
 * {@link FetchAdmittedSkillIdentity} wired to the registry layer over HTTP,
 * the only way one layer reads another (ADR-0001). A request passes its event
 * context so the internal call reuses its platform; a scheduled task passes
 * none, and the platform plugin resolves the Worker env itself.
 */
export function fetchAdmittedSkillIdentity(context?: H3EventContext): FetchAdmittedSkillIdentity {
  return async ({ owner, repository, name }) => {
    // A named object passes `context`, which NitroFetchOptions does not declare.
    const options = { query: { owner, repo: repository, name }, ...(context ? { context } : {}) }
    const answer = await $fetch<{ skillPath: string | null, commitSha: string | null }>('/api/skills/run-identity', options)
    return answer.skillPath ? { skillPath: answer.skillPath, commitSha: answer.commitSha } : null
  }
}

/**
 * Create or replay one Resolution and queue its build.
 *
 * `POST /api/v1/resolutions` and the run sweep both call this, so the sweep
 * checks exactly what `skilld run` gets. The fingerprint names the request as
 * the client sent it, so a replay with the same Idempotency-Key still matches
 * after the registry moves. A public name the registry admitted resolves its
 * admitted folder and commit; a private request never asks the registry.
 */
export async function requestResolution(
  dependencies: ResolutionRequestDependencies,
  input: { source: SourceRequest, idempotencyKey: string, access: ResolutionAccess },
): Promise<CreateResolutionResult> {
  const accountId = input.access.visibility === 'private' ? input.access.accountId : undefined
  const identity = await resolutionRequestIdentity(input.source, input.idempotencyKey, accountId)
  const source = input.access.visibility === 'private'
    ? input.source
    : await admittedSourceRequest(input.source, dependencies.lookupAdmitted)
  const result = await createResolution(dependencies.db, source, identity, dependencies.now(), input.access)
  if (result._tag !== 'idempotency-conflict' && result.row.state === 'requested')
    await dependencies.enqueue(result.row.id)
  return result
}

/**
 * When the queue takes over a build that ran in its request. A Worker keeps a
 * request alive 30 s after its response, so a build the runtime stopped
 * resumes on the queue a few seconds later.
 */
export const IN_REQUEST_BUILD_FALLBACK_SECONDS = 35

export interface AfterResponseBuildDependencies {
  /** Keep work alive after the response, such as the Worker's `waitUntil`. */
  schedule: (work: Promise<unknown>) => void
  /** Run the build here, as the queue consumer would. */
  build: (resolutionId: string) => Promise<ArtifactBuildOutcome>
  enqueue: (resolutionId: string, delaySeconds?: number) => Promise<void>
  /** Settle a Resolution that neither this request nor the queue can build. */
  failUnqueued: (resolutionId: string, error: unknown) => Promise<void>
  reportBuildError: (resolutionId: string, error: unknown) => void
}

/**
 * An `enqueue` that builds the Resolution in its own request, after the
 * response, with the queue as the fallback.
 *
 * The queue delivered a build 1.2 s after the request at the median and 3.4 s
 * at worst, in 20 production runs on 2026-10-07. Its consumer ran in US
 * colos, where each D1 call to the Sydney primary took 158 to 244 ms. A
 * request runs where the client reached Cloudflare, and from Sydney the same
 * calls took 8 to 36 ms. Queue placement cannot move a consumer.
 *
 * A delayed message goes out first, so a build the runtime stops resumes on
 * the queue. A build that throws goes to the queue at once, for its retry
 * ladder. A build that follows an earlier build of the same Skill goes back
 * on the queue after the wait it names, as the consumer does.
 */
export function buildAfterResponse(
  dependencies: AfterResponseBuildDependencies,
): (resolutionId: string) => Promise<void> {
  return async (resolutionId) => {
    dependencies.schedule(buildHere(dependencies, resolutionId))
  }
}

async function buildHere(dependencies: AfterResponseBuildDependencies, resolutionId: string): Promise<void> {
  const fallback = dependencies.enqueue(resolutionId, IN_REQUEST_BUILD_FALLBACK_SECONDS)
    .then(() => ({ _tag: 'queued' as const }), (error: unknown) => ({ _tag: 'unqueued' as const, error }))
  const outcome = await dependencies.build(resolutionId)
    .then(value => ({ _tag: 'built' as const, value }), (error: unknown) => ({ _tag: 'threw' as const, error }))
  const queued = await fallback
  if (outcome._tag === 'built' && outcome.value._tag !== 'deferred')
    return
  if (outcome._tag === 'threw')
    dependencies.reportBuildError(resolutionId, outcome.error)
  const delaySeconds = outcome._tag === 'built' && outcome.value._tag === 'deferred'
    ? outcome.value.delaySeconds
    : undefined
  const sent = await dependencies.enqueue(resolutionId, delaySeconds)
    .then(() => null, (error: unknown) => error)
  // With the delayed message queued, the consumer still takes the build over.
  if (sent !== null && queued._tag === 'unqueued')
    await dependencies.failUnqueued(resolutionId, sent)
}
