export type GhRouteDecision
  = | { _tag: 'pass' }
    | { _tag: 'redirect', location: string }
    | { _tag: 'not-found' }

// GitHub logins are 1 to 39 alphanumerics and hyphens. Repository names are
// 1 to 100 alphanumerics, hyphens, underscores, and dots. Both are unreserved
// URL characters, so a real segment never carries a percent escape. The
// optional `.md` suffix is the agent-readable copy of an owner hub.
const OWNER_SEGMENT = /^[A-Z0-9-]{1,39}(?:\.md)?$/i
const REPO_SEGMENT = /^[\w.-]{1,100}$/

/**
 * Decide a `/gh/*` request before any page renders.
 *
 * A segment that GitHub could never issue answers 404 here. A crawler on
 * ASN 45102 lifted domain text such as `www.thriftbooks.com` out of Skill
 * bodies, resolved it against the page URL, then appended the page title to
 * each result. Every hop rendered a full page whose title fed the next hop:
 * 34% of requests and 36% of CPU time over 2026-09-22 to 2026-09-29.
 *
 * The old all-time board appended an `owner/name` slug to an existing
 * `/gh/owner/repo` path. That duplicated the owner and produced a route no
 * page could match. The exact Skill route remains a stable recovery target;
 * single-Skill repositories redirect once more to their canonical hub.
 */
export function resolveGhRoute(pathname: string, search: string): GhRouteDecision {
  const segments = pathname.split('/')
  if (segments[0] !== '' || segments[1] !== 'gh')
    return { _tag: 'pass' }

  const [, , owner, repo] = segments
  if (owner && !OWNER_SEGMENT.test(owner))
    return { _tag: 'not-found' }
  if (repo && !REPO_SEGMENT.test(repo))
    return { _tag: 'not-found' }

  if (segments.length !== 6)
    return { _tag: 'pass' }

  const [, , , , duplicateOwner, name] = segments
  if (!owner || !repo || !duplicateOwner || !name || owner.toLowerCase() !== duplicateOwner.toLowerCase())
    return { _tag: 'pass' }

  return {
    _tag: 'redirect',
    location: `/gh/${owner}/${repo}/${name}${search}`,
  }
}
