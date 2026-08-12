import { describe, expect, it } from 'vitest'
import { CLUSTERS } from '../../layers/registry/server/data/clusters'
import { listOutcomeSitemapEntries } from '../../layers/registry/server/utils/outcome-sitemap'
import { resolveSkillsRoute } from '../../layers/registry/server/utils/skills-route-policy'

/**
 * `/skills/best` is a static page sharing a path prefix with the `[cluster]`
 * dynamic route, and `/skills/**` is excluded from the pages sitemap. Both of
 * those bite silently: the route policy 404s any `/skills/<one-segment>` it does
 * not know, and a page absent from the outcome sitemap is indexable but never
 * announced.
 */
describe('editorial skill pages', () => {
  it('lets the route policy through instead of 404ing it', () => {
    expect(resolveSkillsRoute('/skills/best', '')).toEqual({ _tag: 'pass' })
  })

  it('announces the page in the sitemap', () => {
    const locations = listOutcomeSitemapEntries().map(entry => entry.loc)

    expect(locations).toContain('/skills/best')
  })

  it('still lists every category alongside it', () => {
    const locations = listOutcomeSitemapEntries().map(entry => entry.loc)

    for (const cluster of CLUSTERS)
      expect(locations, cluster.slug).toContain(`/skills/${cluster.slug}`)
  })

  it('does not collide with a category slug', () => {
    // A category named `best` would shadow the static route and make the
    // editorial page unreachable.
    expect(CLUSTERS.map(cluster => cluster.slug)).not.toContain('best')
  })
})
