import { listOutcomeSitemapEntries } from '../../utils/outcome-sitemap'
import { canonicalRepoSkillPath } from '../../utils/skill-routes'
import { listAllSkillsForSitemap } from '../../utils/skills-registry'

/**
 * Skill URLs in the sitemap are exactly the Skill pages that render
 * `index,follow`. `listAllSkillsForSitemap` applies the trending admission
 * rule (`trending-admission.ts`) that the Skill API applies to the page.
 */
export default defineSitemapEventHandler(async (event) => {
  const skills = await listAllSkillsForSitemap(event)
  return [
    ...listOutcomeSitemapEntries(),
    ...skills.map(s => ({
      loc: canonicalRepoSkillPath(s),
      changefreq: 'weekly' as const,
    })),
  ]
})
