import { setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { presentSkillSearch } from '../../presenters/skill-search-v1'
import { SkillSearchQuery, SkillSearchResponse } from '../../schemas/skill-search-v1'
import { querySkills } from '../../utils/skills-registry'

export default defineApiHandler({
  schema: SkillSearchQuery,
  response: SkillSearchResponse,
  handler: async ({ event, body }) => {
    setHeader(event, 'cache-control', 'public, max-age=60, stale-while-revalidate=300')
    return await querySkills(event, {
      search: body.q,
      limit: body.limit,
      page: 1,
    })
  },
  presenter: presentSkillSearch,
})
