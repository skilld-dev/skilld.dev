/**
 * Fetch without following redirects, on any runtime.
 *
 * workerd accepts only `redirect: 'follow'` and `redirect: 'manual'`. It
 * rejects the `error` redirect mode with a TypeError before the request leaves the
 * Worker, while Node's undici accepts it. Every hosted Artifact build failed
 * from 2026-08-21 to 2026-09-01 for that reason, and the unit suite on Node
 * stayed green. Callers that must not follow a redirect go through this helper
 * and decide what an unexpected redirect means for them.
 */

export type FetchNoRedirectResult
  = { _tag: 'ok', response: Response }
    | { _tag: 'unexpected-redirect', status: number, location: string | null }

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export async function fetchNoRedirect(
  fetcher: typeof globalThis.fetch,
  input: string | URL,
  init: Omit<RequestInit, 'redirect'> = {},
): Promise<FetchNoRedirectResult> {
  const response = await fetcher(input, { ...init, redirect: 'manual' })
  if (!REDIRECT_STATUSES.has(response.status))
    return { _tag: 'ok', response }
  // The redirect body is never read. Cancel it so the connection is released.
  await response.body?.cancel()
  return {
    _tag: 'unexpected-redirect',
    status: response.status,
    location: response.headers.get('location'),
  }
}
