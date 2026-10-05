import { defineApiHandler } from '#shared/server/handler'
import { classifySearchQuery, normalizeSearchQuery } from '#shared/skill-search-query'
import { officialRepos } from '../../data/official-repos'
import { makeSkillBoxSearchPresenter } from '../../presenters/skill-box-search'
import { SkillBoxSearchQuery } from '../../schemas/skills-query'
import { answerCacheIdentity } from '../../utils/search-intent'
import { understandSearchQuery } from '../../utils/search-intent-run'
import { searchIntentDeps, searchSkillBox } from '../../utils/skill-box-search'
import { cachedSkillsSearch } from '../../utils/skill-search-cache'

const officialOwners = new Set(officialRepos.map(r => r.owner))

/**
 * The search box answer: Skills by intent, or one Repository and its Skills.
 *
 * Public read, so no policy. Internal, so it may change on any deploy; the
 * frozen v1 `skills.search` answer is a separate route.
 *
 * Query understanding runs first, from its own month-long global cache, and
 * the minute-long answer cache is keyed by what it returned. An answer that
 * fell back to the typed words then cannot hide the understood answer once
 * the late model reply is cached.
 */
export default defineApiHandler({
  schema: SkillBoxSearchQuery,
  handler: async ({ event, body, platform }) => {
    const query = classifySearchQuery(body.q)
    const intent = query._tag === 'intent'
      ? await understandSearchQuery(searchIntentDeps(event, platform), query.text)
      : null
    return cachedSkillsSearch(
      event,
      () => searchSkillBox(event, platform, { q: body.q, limit: body.limit, officialOwners }, intent),
      'skills-box:v2',
      answerCacheIdentity(normalizeSearchQuery(body.q), body.limit, intent),
    )
  },
  presenter: makeSkillBoxSearchPresenter(officialOwners),
})
