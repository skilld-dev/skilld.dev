/**
 * One retry policy for every upstream read.
 *
 * `fetchUpstreamText` grew a jittered backoff on 2026-08-17, after
 * `raw.githubusercontent.com` answered 503 twice for one SKILL.md request. The
 * ungh tree read never got the same treatment, so one ungh blip answered 503
 * with `retry-after` on the run-command surface while the source was live and
 * serving (SKILLD-1E). The policy lives here so the two readers cannot drift
 * apart again.
 */

/** Statuses the host is expected to clear on its own. */
export const TRANSIENT_UPSTREAM_STATUS: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524])

/** Statuses that prove the document is gone, so a retry cannot help. */
export const MISSING_UPSTREAM_STATUS: ReadonlySet<number> = new Set([404, 410])

/**
 * How long one try may run. On 2026-09-30 GitHub answered nothing for up to
 * 100 seconds and pages waited for it. Three tries at this ceiling plus the
 * backoff stay under 13 seconds.
 */
export const UPSTREAM_TRY_TIMEOUT_MS = 4_000

export interface UpstreamRetryOptions {
  /** Total attempts, including the first. */
  maxAttempts?: number
  /** Ceiling for one try, in milliseconds. */
  timeoutMs?: number
  /** Backoff ceiling for the first retry, doubled on each later one. */
  baseDelayMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
}

export interface UpstreamRetryPolicy {
  maxAttempts: number
  timeoutMs: number
  baseDelayMs: number
  sleep: (milliseconds: number) => Promise<void>
  random: () => number
}

export function resolveUpstreamRetryPolicy(options: UpstreamRetryOptions = {}): UpstreamRetryPolicy {
  return {
    maxAttempts: Math.max(1, Math.floor(options.maxAttempts ?? 3)),
    timeoutMs: Math.max(1, options.timeoutMs ?? UPSTREAM_TRY_TIMEOUT_MS),
    baseDelayMs: Math.max(0, options.baseDelayMs ?? 200),
    sleep: options.sleep ?? ((milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))),
    random: options.random ?? Math.random,
  }
}

/** A null status means the request never answered. That is always transient. */
export function isTransientUpstreamStatus(status: number | null): boolean {
  return status === null || TRANSIENT_UPSTREAM_STATUS.has(status)
}

/** Exponential ceiling with half-to-full jitter, so retries do not synchronise. */
export async function waitBeforeRetry(attempt: number, policy: UpstreamRetryPolicy): Promise<void> {
  const ceiling = policy.baseDelayMs * 2 ** (attempt - 1)
  const jitter = Math.min(1, Math.max(0, policy.random()))
  await policy.sleep(Math.round(ceiling * (0.5 + jitter * 0.5)))
}
