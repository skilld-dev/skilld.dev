export const BROWSER_NO_STORE = 'private, no-store'
export const EDGE_NO_STORE = 'private, no-store'

export interface EdgeCachePolicy {
  maxAge: number
  preserveBrowserCache?: boolean
  staleWhileRevalidate?: number
  staleIfError?: number
}

interface EdgeCacheRule extends EdgeCachePolicy {
  path: RegExp
}

// Workers Cache ignores Cookie when building its default cache key. Keep this
// list intentionally narrow: only handlers whose response is public and does
// not vary by the current user belong here.
const EDGE_CACHE_RULES: EdgeCacheRule[] = [
  { path: /^\/api\/collections\/featured$/, maxAge: 60 },
  { path: /^\/api\/collections$/, maxAge: 60 },
  { path: /^\/api\/feed\/recent-updates$/, maxAge: 60 },
  { path: /^\/api\/feed\/recent-publishes$/, maxAge: 60 },
  { path: /^\/api\/skills-raw\/.+$/, maxAge: 300, preserveBrowserCache: true },
  { path: /^\/api\/npm-guides-raw\/.+$/, maxAge: 3600, preserveBrowserCache: true },
  { path: /^\/api\/skills\/tags$/, maxAge: 300 },
  { path: /^\/api\/clusters$/, maxAge: 600 },
  { path: /^\/api\/clusters\/[^/]+$/, maxAge: 300 },
  { path: /^\/api\/orgs\/[^/]+$/, maxAge: 300 },
  { path: /^\/api\/tags\/[^/]+$/, maxAge: 300 },
  {
    path: /^\/api\/repos\/[^/]+\/[^/]+$/,
    maxAge: 900,
    staleWhileRevalidate: 3600,
    staleIfError: 3600,
  },
  {
    path: /^\/api\/skill-live\/[^/]+\/[^/]+\/[^/]+$/,
    maxAge: 3600,
    staleWhileRevalidate: 86400,
    staleIfError: 86400,
  },
]

export function resolveEdgeCachePolicy(
  method: string,
  pathname: string,
  statusCode: number,
): EdgeCachePolicy | null {
  if (statusCode !== 200 || (method !== 'GET' && method !== 'HEAD'))
    return null

  return EDGE_CACHE_RULES.find(rule => rule.path.test(pathname)) ?? null
}

export function formatEdgeCacheControl(policy: EdgeCachePolicy | null): string {
  if (!policy)
    return EDGE_NO_STORE

  const directives = ['public', `max-age=${policy.maxAge}`]
  if (policy.staleWhileRevalidate)
    directives.push(`stale-while-revalidate=${policy.staleWhileRevalidate}`)
  if (policy.staleIfError)
    directives.push(`stale-if-error=${policy.staleIfError}`)
  return directives.join(', ')
}
