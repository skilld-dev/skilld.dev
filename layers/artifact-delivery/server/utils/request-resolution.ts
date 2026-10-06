import type { H3EventContext } from 'h3'
import type { SourceRequest } from '../schemas/contracts'
import type { FetchAdmittedSkillIdentity } from './admitted-identity'
import type { CreateResolutionResult } from './state'
import { admittedSourceRequest } from './admitted-identity'
import { recordResolutionRequester } from './requester-github'
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
  input: {
    source: SourceRequest
    idempotencyKey: string
    access: ResolutionAccess
    /**
     * The signed-in account that sent a public request, or null. Its build may
     * read GitHub with that account's own token once the shared quota is spent.
     */
    requesterAccountId?: number | null
    /** The skilld CLI that sent the request reads linked files. See ADR-0013. */
    linkedFiles?: boolean
  },
): Promise<CreateResolutionResult> {
  const accountId = input.access.visibility === 'private' ? input.access.accountId : undefined
  // A private build reads blobs and never links a file.
  const linkedFiles = input.access.visibility === 'public' && input.linkedFiles === true
  const identity = await resolutionRequestIdentity(input.source, input.idempotencyKey, accountId, linkedFiles)
  const source = input.access.visibility === 'private'
    ? input.source
    : await admittedSourceRequest(input.source, dependencies.lookupAdmitted)
  const result = await createResolution(dependencies.db, source, identity, dependencies.now(), input.access, linkedFiles)
  if (result._tag === 'created' && input.access.visibility === 'public' && input.requesterAccountId) {
    await recordResolutionRequester(dependencies.db, {
      resolutionId: result.row.id,
      accountId: input.requesterAccountId,
      now: dependencies.now(),
    })
  }
  if (result._tag !== 'idempotency-conflict' && result.row.state === 'requested')
    await dependencies.enqueue(result.row.id)
  return result
}

/**
 * The request header a skilld CLI sends to name the Artifact features it
 * reads, as a comma-separated list. A CLI that sends none reads none.
 */
export const CLIENT_CAPABILITIES_HEADER = 'skilld-capabilities'

/** Whether the header names `linked-files`. Unknown names are ignored. */
export function readsLinkedFiles(header: string | undefined): boolean {
  return (header ?? '')
    .split(',')
    .some(name => name.trim().toLowerCase() === 'linked-files')
}
