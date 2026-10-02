import type { OperationResult, skillsV1 } from 'skilld-sdk/contract'
import type { SkillCardSource } from '#shared/server/skill-cards'
import { presentCount, presentSkillSummaries } from '#shared/server/skill-cards'

export function presentSkillBrowse(result: { items: readonly SkillCardSource[], total: number }): OperationResult<typeof skillsV1.operations.browse> {
  return {
    items: presentSkillSummaries(result.items),
    total: presentCount(result.total),
  }
}
