import { CLUSTERS } from '../data/clusters'

export type SkillsRouteDecision
  = | { _tag: 'pass' }
    | { _tag: 'not_found' }
    | { _tag: 'redirect', location: string }

const marketingPaths = new Set([
  '/skills',
  '/skills/',
  '/skills/guide',
  '/skills/official',
  '/skills/stats',
  ...CLUSTERS.map(cluster => `/skills/${cluster.slug}`),
])

const marketingPrefixes = ['/skills/tag/']

export function resolveSkillsRoute(
  pathname: string,
  search: string,
): SkillsRouteDecision {
  if (!pathname.startsWith('/skills/') && pathname !== '/skills')
    return { _tag: 'pass' }
  if (marketingPaths.has(pathname)
    || marketingPrefixes.some(prefix => pathname.startsWith(prefix))) {
    return { _tag: 'pass' }
  }

  const tail = pathname.slice('/skills/'.length)
  if (tail && !tail.includes('/'))
    return { _tag: 'not_found' }
  return {
    _tag: 'redirect',
    location: `/gh${pathname.slice('/skills'.length)}${search}`,
  }
}
