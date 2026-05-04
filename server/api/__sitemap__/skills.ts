import { listAllSkillsForSitemap, listSupportedSkillsForSitemap } from '../../utils/skills-registry'

export default defineSitemapEventHandler(async (event) => {
  const query = getQuery(event)
  const supportedOnly = query.supported !== 'false' && query.supported !== '0'
  const skills = supportedOnly
    ? await listSupportedSkillsForSitemap(event)
    : await listAllSkillsForSitemap(event)
  return skills.map(s => ({
    loc: `/skills/${s.owner}/${s.repo}/${s.name}`,
    changefreq: 'weekly' as const,
  }))
})
