import type { RepositorySkillValidation } from '#shared/server/skill-validation-sources'
import { loadRepositorySkillValidation } from '#shared/server/skill-validation-sources'

export type AccountSkillValidation = RepositorySkillValidation

/** Only the signed-in account's own Repository sources enter this summary. */
export function loadAccountSkillValidation(db: D1Database, login: string): Promise<AccountSkillValidation> {
  return loadRepositorySkillValidation(db, { _tag: 'owner', owner: login })
}
