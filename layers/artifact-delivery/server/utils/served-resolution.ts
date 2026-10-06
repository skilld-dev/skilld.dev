import type { SourceRequest } from '../schemas/contracts'
import type { ReuseMissReason } from './build'
import type { ResolveSourceResult } from './github-source'
import type { ResolutionRow } from './state'
import type { TrustedRoot } from './trusted-root'
import { createWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { emitOperationalEvent } from '#server/utils/operational-event'
import { findReusableBuild } from './build'
import { getResolution } from './state'

/**
 * How long a Resolution request waits for GitHub to name the commit of a
 * branch. A slower answer builds the request as sent, and the build resolves
 * the branch itself.
 */
export const SERVE_RESOLVE_TIMEOUT_MS = 2_500

export interface ServedResolutionDependencies {
  db: D1Database
  bucket: R2Bucket
  trustedRoot: TrustedRoot
  /** Unix seconds. */
  now: () => number
  /** Resolve a public request that names no commit, as the build would. */
  resolveOnGithub: (source: SourceRequest) => Promise<ResolveSourceResult>
  resolveTimeoutMs?: number
  /** Receives each decision. The default emits the `artifact-resolution-served` wide event. */
  report?: (report: ServedResolutionReport) => void
}

export type ServedResolution
  = | { _tag: 'served', row: ResolutionRow }
    /** No ready build fits. Build `source`, pinned to its commit when GitHub named one. */
    | { _tag: 'build', source: SourceRequest }

export type ServedResolutionReport
  = | { _tag: 'hit', reusedFrom: string }
    | { _tag: 'miss', reason: ReuseMissReason | 'github-unresolved' | 'github-timeout' | 'not-ready' }

/**
 * Answer a public request from the ready build of the same Repository,
 * commit, Skill folder and policy, with no queue and no build.
 *
 * A warm run used to request a new Resolution, wait for the queue, and wait
 * again while the build re-signed the same bytes: 5.6 to 9.2 s in production
 * on 2026-10-07. The ready Resolution answers it now, exactly as `GET
 * /api/v1/resolutions/:id` would. It passes every check a reused build passes:
 * the trusted root verifies its attestation, it names the current policy, its
 * check results pass, and R2 still holds its bytes.
 *
 * A request that names no commit resolves on GitHub first. When no ready
 * build fits, the build gets the request pinned to that commit and folder, as
 * a registry name already is, so it reads no branch again.
 */
export function serveReadyResolution(
  dependencies: ServedResolutionDependencies,
): (source: SourceRequest) => Promise<ServedResolution> {
  const report = dependencies.report ?? emitServedEvent
  return async (source) => {
    const pinned = await pinToCommit(dependencies, source)
    if (pinned._tag !== 'pinned') {
      report({ _tag: 'miss', reason: pinned._tag })
      return { _tag: 'build', source }
    }
    const decision = await findReusableBuild(dependencies, {
      _tag: 'pinned',
      owner: pinned.source.owner,
      repository: pinned.source.repository,
      commitSha: pinned.commitSha,
      selector: pinned.source.selector,
    })
    if (decision._tag === 'miss') {
      report({ _tag: 'miss', reason: decision.reason })
      return { _tag: 'build', source: pinned.source }
    }
    const row = await getResolution(dependencies.db, decision.build.resolutionId)
    if (row?.state !== 'ready') {
      report({ _tag: 'miss', reason: 'not-ready' })
      return { _tag: 'build', source: pinned.source }
    }
    report({ _tag: 'hit', reusedFrom: row.id })
    return { _tag: 'served', row }
  }
}

type PinnedRequest
  = | { _tag: 'pinned', source: SourceRequest, commitSha: string }
    | { _tag: 'github-unresolved' | 'github-timeout' }

async function pinToCommit(
  dependencies: ServedResolutionDependencies,
  source: SourceRequest,
): Promise<PinnedRequest> {
  if (source.ref?.type === 'commit')
    return { _tag: 'pinned', source, commitSha: source.ref.value }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(resolve, dependencies.resolveTimeoutMs ?? SERVE_RESOLVE_TIMEOUT_MS, 'timeout')
  })
  const answer = await Promise.race([
    dependencies.resolveOnGithub(source).catch(() => {
      // Safe to drop: the build reads GitHub again with its own retries,
      // and reports the failure it finds.
      return null
    }),
    timeout,
  ]).finally(() => clearTimeout(timer))
  if (answer === 'timeout')
    return { _tag: 'github-timeout' }
  if (answer?._tag !== 'resolved' || answer.source.visibility !== 'public')
    return { _tag: 'github-unresolved' }
  return {
    _tag: 'pinned',
    commitSha: answer.source.commitSha,
    source: {
      provider: source.provider,
      owner: source.owner,
      repository: source.repository,
      selector: { type: 'path', path: answer.source.skillPath },
      ref: { type: 'commit', value: answer.source.commitSha },
    },
  }
}

function emitServedEvent(report: ServedResolutionReport): void {
  if (report._tag === 'hit') {
    emitOperationalEvent(createWideEvent({
      'operation': 'artifact-resolution-served',
      'outcome': 'hit',
      'artifact.reusedFrom': report.reusedFrom,
    }), 'info')
    return
  }
  emitOperationalEvent(createWideEvent({
    operation: 'artifact-resolution-served',
    outcome: 'miss',
    reason: report.reason,
  }), 'info')
}
