import type { UpstreamRetryOptions } from './upstream-retry'
import {
  isTransientUpstreamStatus,
  MISSING_UPSTREAM_STATUS,
  resolveUpstreamRetryPolicy,
  waitBeforeRetry,
} from './upstream-retry'

/**
 * Read a text document from a third-party host as a tagged outcome.
 *
 * `raw.githubusercontent.com` answered `503` twice for one SKILL.md request on
 * 2026-08-17 (Sentry SKILLD-11). The caller collapsed every failure into
 * `null`, so a GitHub blip and a deleted file produced the same 502 and the
 * same "missing" cache marker. Splitting the outcomes keeps a short outage out
 * of the error budget, and keeps a real outage reportable.
 */

export type UpstreamText
  = | { _tag: 'ok', body: string }
    | { _tag: 'missing', status: number }
    | { _tag: 'unavailable', status: number | null, attempts: number }

export interface UpstreamTextOptions extends UpstreamRetryOptions {
  fetch?: (url: string) => Promise<Response>
}

type Attempt
  = | { _tag: 'response', response: Response }
    | { _tag: 'threw' }

export async function fetchUpstreamText(
  url: string,
  options: UpstreamTextOptions = {},
): Promise<UpstreamText> {
  const policy = resolveUpstreamRetryPolicy(options)
  const request = options.fetch ?? ((target: string) => globalThis.fetch(target))

  let status: number | null = null
  for (let attempt = 1; ; attempt++) {
    const outcome: Attempt = await Promise.resolve()
      .then(() => request(url))
      .then(
        response => ({ _tag: 'response' as const, response }),
        () => ({ _tag: 'threw' as const }),
      )

    if (outcome._tag === 'response') {
      if (outcome.response.ok)
        return { _tag: 'ok', body: await outcome.response.text() }
      status = outcome.response.status
      if (MISSING_UPSTREAM_STATUS.has(status))
        return { _tag: 'missing', status }
      if (!isTransientUpstreamStatus(status))
        return { _tag: 'unavailable', status, attempts: attempt }
    }
    else {
      status = null
    }

    if (attempt >= policy.maxAttempts)
      return { _tag: 'unavailable', status, attempts: attempt }

    await waitBeforeRetry(attempt, policy)
  }
}
