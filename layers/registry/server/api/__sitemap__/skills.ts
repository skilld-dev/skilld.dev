import { listOutcomeSitemapEntries } from '../../utils/outcome-sitemap'
import { canonicalRepoSkillPath } from '../../utils/skill-routes'
import { listAllSkillsForSitemap, listSupportedSkillsForSitemap } from '../../utils/skills-registry'

export default defineSitemapEventHandler(async (event) => {
  const query = getQuery(event)
  const supportedOnly = query.supported !== 'false' && query.supported !== '0'
  const skills = supportedOnly
    ? await listSupportedSkillsForSitemap(event)
    : await listAllSkillsForSitemap(event)
  return [
    ...listOutcomeSitemapEntries(),
    ...skills.map(s => ({
      loc: canonicalRepoSkillPath(s),
      changefreq: 'weekly' as const,
    })),
  ]
})
