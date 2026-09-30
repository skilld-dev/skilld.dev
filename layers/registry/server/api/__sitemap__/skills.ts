import { getDB } from '#server/utils/db'
import { cached } from '#shared/server/cache'
import { runAfterResponse } from '../../utils/after-response'
import { listOutcomeSitemapEntries } from '../../utils/outcome-sitemap'
import { canonicalRepoSkillPath } from '../../utils/skill-routes'
import { listAllSkillsForSitemap } from '../../utils/skills-registry'
import { listTrendingSitemapEntries } from '../../utils/trending-sitemap'

/**
 * Skill URLs in the sitemap are exactly the Skill pages that render
 * `index,follow`. `listAllSkillsForSitemap` applies the trending admission
 * rule (`trending-admission.ts`) that the Skill API applies to the page. The
 * trending boards join them, so a crawler can find the admitted set.
 */
export default defineSitemapEventHandler(async (event) => {
  const skills = await listAllSkillsForSitemap(event)
  const boards = await cached({
    storage: useStorage('cache'),
    key: 'skills:trending-sitemap:v1',
    ttlSeconds: 60 * 60,
    staleSeconds: 60 * 60 * 24,
    compute: () => listTrendingSitemapEntries(getDB(event), Math.floor(Date.now() / 1000)),
    schedule: promise => runAfterResponse(event, promise),
  })
  return [
    ...listOutcomeSitemapEntries(),
    ...boards,
    ...skills.map(s => ({
      loc: canonicalRepoSkillPath(s),
      changefreq: 'weekly' as const,
    })),
  ]
})
