import { CLUSTERS, RENAMED_CLUSTER_SLUGS } from '../data/clusters'

export type SkillsRouteDecision
  = | { _tag: 'pass' }
    | { _tag: 'not_found' }
    | { _tag: 'redirect', location: string }

const marketingPaths = new Set([
  '/skills',
  '/skills/',
  '/skills/best',
  '/skills/guide',
  '/skills/leaderboard',
  '/skills/official',
  '/skills/stats',
  '/skills/trending',
  ...CLUSTERS.map(cluster => `/skills/${cluster.slug}`),
  // Renamed on 2026-08-12. They are no longer clusters, so without this they
  // would 404 here before nuxt.config's routeRules could 301 them.
  ...Object.keys(RENAMED_CLUSTER_SLUGS).map(slug => `/skills/${slug}`),
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
