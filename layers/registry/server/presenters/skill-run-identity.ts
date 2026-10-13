import type { SkillRunIdentity } from '../utils/skill-run-identity'

export interface SkillRunIdentityDto {
  skillPath: string | null
  commitSha: string | null
  /** The new name of a renamed Skill, set only when `skillPath` is null. */
  renamedTo: string | null
}

/** What one Skill name resolves to: an admitted identity, a new name, or nothing. */
export type SkillRunAnswer
  = | { _tag: 'admitted', identity: SkillRunIdentity }
    | { _tag: 'renamed', name: string }
    | { _tag: 'unknown' }

export function presentSkillRunIdentity(answer: SkillRunAnswer): SkillRunIdentityDto {
  switch (answer._tag) {
    case 'admitted':
      return { skillPath: answer.identity.skillPath, commitSha: answer.identity.commitSha, renamedTo: null }
    case 'renamed':
      return { skillPath: null, commitSha: null, renamedTo: answer.name }
    case 'unknown':
      return { skillPath: null, commitSha: null, renamedTo: null }
  }
}
