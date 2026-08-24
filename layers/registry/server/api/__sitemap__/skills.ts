import { listOutcomeSitemapEntries } from '../../utils/outcome-sitemap'
import { repoSkillPath } from '../../utils/skill-routes'
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
      loc: repoSkillPath(s.owner, s.repo, s.name, s.repoSkillCount),
      changefreq: 'weekly' as const,
    })),
  ]
})
