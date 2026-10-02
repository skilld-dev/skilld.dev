import type { LegacySkillDetail } from '../../../../../presenters/skill-detail-v1'
import { skillsV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { presentSkillDetail } from '../../../../../presenters/skill-detail-v1'

/**
 * Reads the Skill page's own detail route in process, so v1 shares its
 * read-through cache, its live render fallback, and its D1 budget.
 */
export default defineApiOperation({
  operation: skillsV1.operations.get,
  handler: async ({ event, input }) => {
    const { owner, repository, name } = input.params
    const detail = await event.$fetch<LegacySkillDetail>(`/api/skills/${owner}/${repository}/${name}`)
    return presentSkillDetail(detail)
  },
})
