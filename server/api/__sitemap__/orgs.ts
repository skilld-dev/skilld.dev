import { ownerHubPath } from '../../utils/skill-routes'
import { listAllOwnersForSitemap } from '../../utils/skills-registry'

export default defineSitemapEventHandler(async (event) => {
  const owners = await listAllOwnersForSitemap(event)
  return owners.map(o => ({
    loc: ownerHubPath(o.owner),
    changefreq: 'weekly' as const,
  }))
})
