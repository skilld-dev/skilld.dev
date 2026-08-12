import { describe, expect, it } from 'vitest'
import { CLUSTERS } from '../../layers/registry/server/data/clusters'
import { listOutcomeSitemapEntries } from '../../layers/registry/server/utils/outcome-sitemap'

describe('outcome sitemap entries', () => {
  it('lists every category route exactly once', () => {
    const locations = listOutcomeSitemapEntries().map(entry => entry.loc)

    for (const cluster of CLUSTERS)
      expect(locations, cluster.slug).toContain(`/skills/${cluster.slug}`)
    expect(new Set(locations).size).toBe(locations.length)
  })

  it('carries the editorial pages that have no category row', () => {
    // `/skills/**` is excluded from the pages sitemap, so an editorial page is
    // announced here or nowhere. It has no CLUSTERS entry to be derived from,
    // which is why this list is longer than the category count.
    const locations = listOutcomeSitemapEntries().map(entry => entry.loc)

    expect(locations).toContain('/skills/best')
    expect(locations.length).toBeGreaterThan(CLUSTERS.length)
  })
})
