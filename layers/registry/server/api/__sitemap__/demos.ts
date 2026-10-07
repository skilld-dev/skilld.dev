import { fetchFlaggedSkillKeys } from '#shared/server/run-check-flags'
import { listDemoSitemapEntries } from '../../utils/skill-demos'

/**
 * `/skills/demos` and every demo page the board shows. The pages sitemap
 * excludes `/skills/**`, so without this source the pages would be indexable
 * but never announced. nuxt.config lists this sitemap only while
 * `page-admissions.ts` admits `/skills/demos`.
 */
export default defineSitemapEventHandler(async () =>
  listDemoSitemapEntries(await fetchFlaggedSkillKeys('demos-sitemap')))
