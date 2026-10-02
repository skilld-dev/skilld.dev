import { skillsV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { presentSkillSearch } from '../../../presenters/skill-search-v1'
import { querySkills } from '../../../utils/skills-registry'

export default defineApiOperation({
  operation: skillsV1.operations.search,
  handler: async ({ event, input }) => presentSkillSearch(await querySkills(event, {
    search: input.query.q,
    limit: input.query.limit,
    page: 1,
  })),
})
