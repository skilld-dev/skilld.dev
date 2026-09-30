/**
 * Retry policy for one GitHub REST read on the Artifact build path.
 *
 * On 2026-09-30 the network path from Cloudflare Workers to GitHub failed on
 * and off for hours: timeouts, lost connections, 520 to 524 answers and
 * truncated bodies. One hung read cost a whole queue attempt and a backoff of
 * 60 seconds or more. A second try clears most of these. A 4xx answer is a
 * fact about the request, so it never retries.
 *
 * The budget is fixed: two tries of `GITHUB_READ_TRY_TIMEOUT_MS` and one short
 * delay. A read cannot outlast `GITHUB_READ_MAX_BUDGET_MS`.
 */

export const GITHUB_READ_TRY_TIMEOUT_MS = 8_000
export const GITHUB_READ_RETRY_DELAY_MIN_MS = 100
export const GITHUB_READ_RETRY_DELAY_SPREAD_MS = 300
export const GITHUB_READ_MAX_BUDGET_MS
  = 2 * GITHUB_READ_TRY_TIMEOUT_MS + GITHUB_READ_RETRY_DELAY_MIN_MS + GITHUB_READ_RETRY_DELAY_SPREAD_MS

/** Statuses that mean the path to GitHub failed, not that the request was wrong. */
const RETRYABLE_STATUS: ReadonlySet<number> = new Set([502, 503, 504, 520, 521, 522, 523, 524])

export function isRetryableGithubStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status)
}

/**
 * The path of a GitHub API request, without its query string. The query can
 * carry a secret in principle, and the path alone names the endpoint.
 */
export function githubEndpointPath(path: string): string {
  const end = path.search(/[?#]/)
  return end === -1 ? path : path.slice(0, end)
}

/** A body that was cut short parses as invalid JSON. That is a network failure. */
export function isTruncatedBody(error: unknown): boolean {
  return error instanceof SyntaxError
}

/** Own limit errors say so in their message. A retry cannot shrink a body. */
export function isBodyLimitError(error: unknown): boolean {
  return error instanceof Error
    && (error.message === 'GitHub response exceeded the byte limit' || error.message === 'GitHub returned an empty response')
}

export function describeReadError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type GithubReadTry<T>
  = | { _tag: 'settled', value: T }
    /** The path to GitHub failed. One more try may clear it. */
    | { _tag: 'transient', reason: string, status: number | null }
    /** The answer is final. A retry would ask the same question again. */
    | { _tag: 'fatal', reason: string, status: number | null }

export type GithubReadResult<T>
  = | { _tag: 'settled', value: T }
    | { _tag: 'failed', reason: string, status: number | null, attempts: number }

export interface GithubReadRetryOptions {
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
}

/**
 * Run `attempt`, and run it once more after a transient failure.
 * The caller owns the request, so every try asks for the same pinned URL.
 */
export async function readGithubWithRetry<T>(
  attempt: () => Promise<GithubReadTry<T>>,
  options: GithubReadRetryOptions = {},
): Promise<GithubReadResult<T>> {
  const first = await attempt()
  if (first._tag === 'settled')
    return first
  if (first._tag === 'fatal')
    return { _tag: 'failed', reason: first.reason, status: first.status, attempts: 1 }

  const sleep = options.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))
  const random = options.random ?? Math.random
  const jitter = Math.min(1, Math.max(0, random()))
  await sleep(Math.round(GITHUB_READ_RETRY_DELAY_MIN_MS + jitter * GITHUB_READ_RETRY_DELAY_SPREAD_MS))

  const second = await attempt()
  if (second._tag === 'settled')
    return second
  return { _tag: 'failed', reason: second.reason, status: second.status, attempts: 2 }
}
