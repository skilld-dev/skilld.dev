export interface SkillTitleIdentity {
  name: string
  owner: string
}

export function resolveSkillTitle(
  skill: SkillTitleIdentity | null | undefined,
  routeSkill: SkillTitleIdentity,
): string {
  const identity = skill ?? routeSkill
  return `${identity.name} by ${identity.owner}`
}
