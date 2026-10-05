import { defineApiHandler } from '#shared/server/handler'
import { normalizeSearchQuery } from '#shared/skill-search-query'
import { officialRepos } from '../../data/official-repos'
import { makeSkillBoxSearchPresenter } from '../../presenters/skill-box-search'
import { SkillBoxSearchQuery } from '../../schemas/skills-query'
import { searchSkillBox } from '../../utils/skill-box-search'
import { cachedSkillsSearch } from '../../utils/skill-search-cache'

const officialOwners = new Set(officialRepos.map(r => r.owner))

/**
 * The search box answer: Skills by intent, or one Repository and its Skills.
 *
 * Public read, so no policy. Internal, so it may change on any deploy; the
 * frozen v1 `skills.search` answer is a separate route. The answer is cached
 * by the normalised query for a minute, and query understanding keeps its
 * own month-long cache, so a repeated sentence never pays for the model twice.
 */
export default defineApiHandler({
  schema: SkillBoxSearchQuery,
  handler: ({ event, body, platform }) => cachedSkillsSearch(
    event,
    () => searchSkillBox(event, platform, { q: body.q, limit: body.limit, officialOwners }),
    'skills-box:v1',
    JSON.stringify([normalizeSearchQuery(body.q), body.limit]),
  ),
  presenter: makeSkillBoxSearchPresenter(officialOwners),
})
