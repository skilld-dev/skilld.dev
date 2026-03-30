import { getSkillsFromSitemap } from '../../utils/skills-sitemap'

export default defineSitemapEventHandler(async () => {
  const skills = await getSkillsFromSitemap()
  return skills.map(skill => ({
    loc: `/skills/${skill.owner}/${skill.repo}/${skill.name}`,
    changefreq: 'weekly' as const,
  }))
})
