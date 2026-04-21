import { listAllSkillsForSitemap } from '../../utils/skills-registry'

export default defineSitemapEventHandler(async (event) => {
  const skills = await listAllSkillsForSitemap(event)
  return skills.map(s => ({
    loc: `/skills/${s.owner}/${s.repo}/${s.name}`,
    changefreq: 'weekly' as const,
  }))
})
