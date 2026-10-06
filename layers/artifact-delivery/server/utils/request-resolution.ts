import type { H3EventContext } from 'h3'
import type { SourceRequest } from '../schemas/contracts'
import type { FetchAdmittedSkillIdentity } from './admitted-identity'
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

export interface AfterResponseEnqueueDependencies {
  /** Keep work alive after the response, such as the Worker's `waitUntil`. */
  schedule: (work: Promise<unknown>) => void
  enqueue: (resolutionId: string) => Promise<void>
  /** Settle a Resolution whose build never reached the queue. */
  failUnqueued: (resolutionId: string, error: unknown) => Promise<void>
}

/**
 * An `enqueue` that sends the build message after the response.
 *
 * The queue send took 446 to 500 ms of a 590 to 650 ms request in three
 * production traces from Sydney and Bangkok on 2026-10-07. The CLI polls
 * for the result anyway, so the send need not hold the first answer. A send
 * that fails settles the Resolution as a retryable failure, so the polling
 * CLI requests a new Resolution instead of waiting out its deadline.
 */
export function enqueueAfterResponse(
  dependencies: AfterResponseEnqueueDependencies,
): (resolutionId: string) => Promise<void> {
  return async (resolutionId) => {
    dependencies.schedule(
      dependencies.enqueue(resolutionId)
        .catch(error => dependencies.failUnqueued(resolutionId, error)),
    )
  }
}
