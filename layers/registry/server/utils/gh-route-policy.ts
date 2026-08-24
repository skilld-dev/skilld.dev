export type GhRouteDecision
  = | { _tag: 'pass' }
    | { _tag: 'redirect', location: string }

/**
 * Recover Skill URLs emitted before registry paths became canonical values.
 *
 * The old all-time board appended an `owner/name` slug to an existing
 * `/gh/owner/repo` path. That duplicated the owner and produced a route no
 * page could match. The exact Skill route remains a stable recovery target;
 * single-Skill repositories redirect once more to their canonical hub.
 */
export function resolveGhRoute(pathname: string, search: string): GhRouteDecision {
  const segments = pathname.split('/')
  if (segments.length !== 6 || segments[0] !== '' || segments[1] !== 'gh')
    return { _tag: 'pass' }

  const [, , owner, repo, duplicateOwner, name] = segments
  if (!owner || !repo || !duplicateOwner || !name || owner.toLowerCase() !== duplicateOwner.toLowerCase())
    return { _tag: 'pass' }

  return {
    _tag: 'redirect',
    location: `/gh/${owner}/${repo}/${name}${search}`,
  }
}
