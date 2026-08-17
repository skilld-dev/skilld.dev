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

export interface UpstreamTextOptions {
  fetch?: (url: string) => Promise<Response>
  maxAttempts?: number
  baseDelayMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
}

/** Statuses the host is expected to clear on its own. */
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

/** Statuses that prove the document is gone, so a retry cannot help. */
const MISSING_STATUS = new Set([404, 410])

type Attempt
  = | { _tag: 'response', response: Response }
    | { _tag: 'threw' }

export async function fetchUpstreamText(
  url: string,
  options: UpstreamTextOptions = {},
): Promise<UpstreamText> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3))
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 200)
  const request = options.fetch ?? ((target: string) => globalThis.fetch(target))
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds)))
  const random = options.random ?? Math.random

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
      if (MISSING_STATUS.has(status))
        return { _tag: 'missing', status }
      if (!TRANSIENT_STATUS.has(status))
        return { _tag: 'unavailable', status, attempts: attempt }
    }
    else {
      status = null
    }

    if (attempt >= maxAttempts)
      return { _tag: 'unavailable', status, attempts: attempt }

    const ceiling = baseDelayMs * 2 ** (attempt - 1)
    const jitter = Math.min(1, Math.max(0, random()))
    await sleep(Math.round(ceiling * (0.5 + jitter * 0.5)))
  }
}
