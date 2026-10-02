import { skillsV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { presentSkillBrowse } from '../../presenters/skill-summary-v1'
import { cachedSkillsSearch } from '../../utils/skill-search-cache'
import { querySkills } from '../../utils/skills-registry'

/**
 * The query behind skilld.dev/skills, behind the same short shared cache. The
 * cache key hashes the query string alone, so this route keeps its own
 * namespace: `/api/skills` answers the same query string in another shape.
 */
export default defineApiOperation({
  operation: skillsV1.operations.browse,
  handler: ({ event, input }) => {
    const { q, owner, tag, sort, limit, offset } = input.query
    return cachedSkillsSearch(event, async () => presentSkillBrowse(await querySkills(event, {
      // The registry stores logins and search terms folded to lowercase.
      search: q?.toLowerCase(),
      owner: owner?.toLowerCase(),
      tags: tag ? [tag] : undefined,
      sort,
      limit,
      offset,
    })), 'api-v1-browse:v1')
  },
})
