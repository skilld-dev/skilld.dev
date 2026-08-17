export type OrgsRouteDecision
  = | { _tag: 'pass' }
    | { _tag: 'redirect', location: string }

/**
 * Send retired `/orgs` URLs to their live equivalent in one hop.
 *
 * `/orgs/<owner>` became `/gh/<owner>`, so the tail carries over. The bare
 * index has no `/gh` twin: owner hubs only exist per owner. Pointing it at
 * `/gh` produced a 301 into a 404, which passes no link equity and strands the
 * reader. `/community` is the browsable owner surface.
 */
export function resolveOrgsRedirect(pathname: string, search: string): OrgsRouteDecision {
  if (pathname !== '/orgs' && !pathname.startsWith('/orgs/'))
    return { _tag: 'pass' }

  const tail = pathname === '/orgs' ? '' : pathname.slice('/orgs'.length)
  if (!tail || tail === '/')
    return { _tag: 'redirect', location: `/community${search}` }

  return { _tag: 'redirect', location: `/gh${tail}${search}` }
}
