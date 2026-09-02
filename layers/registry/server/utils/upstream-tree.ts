/**
 * Read a repository file tree from ungh as a tagged outcome.
 *
 * A deleted repository and an ungh outage are different facts. Collapsing
 * both into one failure made every endpoint answer 503 with `retry-after`,
 * which tells an agent to keep retrying a permanent condition and raises one
 * Sentry event per retry (SKILLD-11). `skills-raw` split them on 2026-08-30;
 * this holds the split so `skill-files` and `skill-asset` cannot drift back.
 *
 * An outage that lasts one request is a third fact. The read retries with the
 * shared backoff before it reports one, because a single ungh blip against a
 * live source used to reach the agent as a 503 (SKILLD-1E).
 */

import type { UpstreamRetryOptions } from './upstream-retry'
import {
  isTransientUpstreamStatus,
  MISSING_UPSTREAM_STATUS,
  resolveUpstreamRetryPolicy,
  waitBeforeRetry,
} from './upstream-retry'

export type UpstreamTree
  = | { _tag: 'available', files: UpstreamTreeFile[] }
    | { _tag: 'gone' }
    | { _tag: 'unavailable' }

export interface UpstreamTreeFile {
  path: string
  size?: number
}

/**
 * ofetch rejections carry the HTTP status, but the type loses it. Null means
 * the request never answered. That is an outage, never a deletion.
 */
export function fetchErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object')
    return null
  const status = (error as { status?: unknown }).status
  if (typeof status === 'number')
    return status
  const response = (error as { response?: { status?: unknown } }).response
  if (response && typeof response.status === 'number')
    return response.status
  return null
}

export interface FetchUpstreamTreeOptions extends UpstreamRetryOptions {
  /** Wide-event operation name, so each endpoint keeps its own attribution. */
  operation: string
}

type TreeAttempt
  = | { _tag: 'files', files: UpstreamTreeFile[] }
    | { _tag: 'malformed' }
    | { _tag: 'gone' }
    | { _tag: 'failed', status: number | null }

/**
 * ungh is a third party, so its body is parsed here, once, into the tree type.
 * Entries without a usable path are dropped rather than carried inward.
 */
function parseTree(body: unknown): TreeAttempt {
  if (!body || typeof body !== 'object')
    return { _tag: 'malformed' }
  const files = (body as { files?: unknown }).files
  if (files === undefined)
    return { _tag: 'files', files: [] }
  if (!Array.isArray(files))
    return { _tag: 'malformed' }
  return {
    _tag: 'files',
    files: files.flatMap<UpstreamTreeFile>((entry) => {
      if (!entry || typeof entry !== 'object')
        return []
      const path = (entry as { path?: unknown }).path
      if (typeof path !== 'string' || !path)
        return []
      const size = (entry as { size?: unknown }).size
      return [typeof size === 'number' ? { path, size } : { path }]
    }),
  }
}

async function readTree(url: string): Promise<TreeAttempt> {
  // ofetch retries a GET once on its own, with no delay, which is too fast to
  // clear anything. `retry: 0` keeps the policy below the only retry, so the
  // attempt count in the wide event is the real one.
  return $fetch<unknown>(url, { retry: 0 }).then(
    body => parseTree(body),
    (error: unknown) => {
      const status = fetchErrorStatus(error)
      // A 404 means the repository or the branch is gone. Both are permanent
      // at this URL. Anything else is ungh failing to answer.
      if (status !== null && MISSING_UPSTREAM_STATUS.has(status))
        return { _tag: 'gone' as const }
      return { _tag: 'failed' as const, status }
    },
  )
}

export async function fetchUpstreamTree(
  source: { owner: string, repo: string },
  branch: string,
  options: FetchUpstreamTreeOptions,
): Promise<UpstreamTree> {
  const policy = resolveUpstreamRetryPolicy(options)
  const url = `https://ungh.cc/repos/${source.owner}/${source.repo}/files/${branch}`

  for (let attempt = 1; ; attempt++) {
    const result = await readTree(url)

    if (result._tag === 'files') {
      if (attempt > 1)
        emitOperationalEvent(createWideEvent({ operation: options.operation, outcome: 'recovered', attempt }))
      return { _tag: 'available', files: result.files }
    }

    if (result._tag === 'gone') {
      emitOperationalEvent(createWideEvent({ operation: options.operation, outcome: 'gone' }))
      return { _tag: 'gone' }
    }

    if (result._tag === 'malformed') {
      // ungh answered, so this is not an outage a retry clears. Report it
      // rather than reading a body of the wrong shape as an empty repository.
      emitOperationalEvent(createWideEvent({ operation: options.operation, outcome: 'failed', reason: 'tree_malformed', attempt }))
      return { _tag: 'unavailable' }
    }

    if (!isTransientUpstreamStatus(result.status) || attempt >= policy.maxAttempts) {
      emitOperationalEvent(createWideEvent({ 'operation': options.operation, 'outcome': 'failed', 'upstream.status': result.status ?? 0, 'attempt': attempt }))
      return { _tag: 'unavailable' }
    }

    await waitBeforeRetry(attempt, policy)
  }
}
