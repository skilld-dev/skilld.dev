import { CLUSTERS } from '../data/clusters'

export interface OutcomeSitemapEntry {
  loc: string
  changefreq: 'weekly'
}

export function listOutcomeSitemapEntries(): OutcomeSitemapEntry[] {
  return CLUSTERS.map(cluster => ({
    loc: `/skills/${cluster.slug}`,
    changefreq: 'weekly',
  }))
}
