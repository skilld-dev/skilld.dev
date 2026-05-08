import { repoSkillPath } from '~~/layers/registry/server/utils/skill-routes'
import { listAllSkillsForSitemap, listSupportedSkillsForSitemap } from '~~/layers/registry/server/utils/skills-registry'

export default defineSitemapEventHandler(async (event) => {
  const query = getQuery(event)
  const supportedOnly = query.supported !== 'false' && query.supported !== '0'
  const skills = supportedOnly
    ? await listSupportedSkillsForSitemap(event)
    : await listAllSkillsForSitemap(event)
  return skills.map(s => ({
    loc: repoSkillPath(s.owner, s.repo, s.name),
    changefreq: 'weekly' as const,
  }))
})
