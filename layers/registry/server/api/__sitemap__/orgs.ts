import { ownerHubPath } from '~~/layers/registry/server/utils/skill-routes'
import { listAllOwnersForSitemap } from '~~/layers/registry/server/utils/skills-registry'

export default defineSitemapEventHandler(async (event) => {
  const owners = await listAllOwnersForSitemap(event)
  return owners.map(o => ({
    loc: ownerHubPath(o.owner),
    changefreq: 'weekly' as const,
  }))
})
