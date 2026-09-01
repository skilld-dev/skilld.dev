/**
 * Read a repository file tree from ungh as a tagged outcome.
 *
 * A deleted repository and an ungh outage are different facts. Collapsing
 * both into one failure made every endpoint answer 503 with `retry-after`,
 * which tells an agent to keep retrying a permanent condition and raises one
 * Sentry event per retry (SKILLD-11). `skills-raw` split them on 2026-08-30;
 * this holds the split so `skill-files` and `skill-asset` cannot drift back.
 */

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

export interface FetchUpstreamTreeOptions {
  /** Wide-event operation name, so each endpoint keeps its own attribution. */
  operation: string
}

export async function fetchUpstreamTree(
  source: { owner: string, repo: string },
  branch: string,
  options: FetchUpstreamTreeOptions,
): Promise<UpstreamTree> {
  return $fetch<{ files?: UpstreamTreeFile[] }>(
    `https://ungh.cc/repos/${source.owner}/${source.repo}/files/${branch}`,
  ).then(
    response => ({ _tag: 'available' as const, files: response.files ?? [] }),
    (error: unknown) => {
      // A 404 means the repository or the branch is gone. Both are permanent
      // at this URL. Anything else is ungh failing to answer.
      if (fetchErrorStatus(error) === 404) {
        emitOperationalEvent(createWideEvent({ operation: options.operation, outcome: 'gone' }))
        return { _tag: 'gone' as const }
      }
      emitOperationalEvent(createWideEvent({ operation: options.operation, outcome: 'failed' }))
      return { _tag: 'unavailable' as const }
    },
  )
}
