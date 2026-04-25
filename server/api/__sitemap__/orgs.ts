import { listAllOwnersForSitemap } from '../../utils/skills-registry'

export default defineSitemapEventHandler(async (event) => {
  const owners = await listAllOwnersForSitemap(event)
  return owners.map(o => ({
    loc: `/orgs/${o.owner}`,
    changefreq: 'weekly' as const,
  }))
})
