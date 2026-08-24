export interface CanonicalRepoSkillPathInput {
  owner: string
  repo: string
  name: string
  /** Resolved Skills only. This value decides the canonical route. */
  repoSkillCount: number
}

export function ownerHubPath(owner: string): string {
  return `/gh/${owner}`
}

export function repoHubPath(owner: string, repo: string): string {
  return `${ownerHubPath(owner)}/${repo}`
}

/** The address of one exact Skill, independent of its canonical URL. */
export function repoSkillPath(owner: string, repo: string, name: string): string {
  return `${repoHubPath(owner, repo)}/${name}`
}

/**
 * The public URL for a Skill.
 *
 * The object argument makes the resolved count mandatory. Callers cannot
 * silently fall back to the legacy detail route by omitting it.
 */
export function canonicalRepoSkillPath(input: CanonicalRepoSkillPathInput): string {
  return input.repoSkillCount === 1
    ? repoHubPath(input.owner, input.repo)
    : repoSkillPath(input.owner, input.repo, input.name)
}
