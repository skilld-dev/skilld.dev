import { describe, expect, it } from 'vitest'
import { CLUSTERS } from '../../layers/registry/server/data/clusters'
import { listOutcomeSitemapEntries } from '../../layers/registry/server/utils/outcome-sitemap'

describe('outcome sitemap entries', () => {
  it('lists every stable outcome route exactly once', () => {
    const entries = listOutcomeSitemapEntries()

    expect(entries.map(entry => entry.loc)).toEqual(
      CLUSTERS.map(cluster => `/skills/${cluster.slug}`),
    )
    expect(new Set(entries.map(entry => entry.loc))).toHaveLength(CLUSTERS.length)
  })
})
