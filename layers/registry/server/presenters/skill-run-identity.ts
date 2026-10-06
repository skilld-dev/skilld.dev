import type { SkillRunIdentity } from '../utils/skill-run-identity'

export interface SkillRunIdentityDto {
  skillPath: string | null
  commitSha: string | null
}

export function presentSkillRunIdentity(identity: SkillRunIdentity | null): SkillRunIdentityDto {
  return {
    skillPath: identity?.skillPath ?? null,
    commitSha: identity?.commitSha ?? null,
  }
}
