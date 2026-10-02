import type { LegacySkillDetail } from '../../../../../presenters/skill-detail-v1'
import { skillsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentSkillDetail } from '../../../../../presenters/skill-detail-v1'
import { readOwnRoute } from '../../../../../utils/own-route-read'

/**
 * Reads the Skill page's own detail route in process, so v1 shares its
 * read-through cache, its live render fallback, and its D1 budget.
 */
export default defineApiOperation({
  operation: skillsV1.operations.get,
  handler: async ({ event, input }) => {
    const { owner, repository, name } = input.params
    const detail = await readOwnRoute<LegacySkillDetail>(event, `/api/skills/${owner}/${repository}/${name}`)
    if (detail._tag === 'missing')
      return operationFailure('NOT_FOUND', `The registry holds no Skill ${owner}/${repository}/${name}.`)
    return presentSkillDetail(detail.value)
  },
})
