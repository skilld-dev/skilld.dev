export type OrgsRouteDecision
  = | { _tag: 'pass' }
    | { _tag: 'redirect', location: string }

/**
 * Send retired `/orgs` URLs to their live equivalent in one hop.
 *
 * `/orgs/<owner>` became `/@<owner>`, the author profile that remains useful
 * even after an owner has no published skills. The bare index has no author
 * twin, so it goes to the browsable owner surface at `/community`.
 */
export function resolveOrgsRedirect(pathname: string, search: string): OrgsRouteDecision {
  if (pathname !== '/orgs' && !pathname.startsWith('/orgs/'))
    return { _tag: 'pass' }

  const tail = pathname === '/orgs' ? '' : pathname.slice('/orgs'.length)
  if (!tail || tail === '/')
    return { _tag: 'redirect', location: `/community${search}` }

  return { _tag: 'redirect', location: `/@${tail.slice(1)}${search}` }
}
