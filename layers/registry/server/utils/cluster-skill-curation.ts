interface ClusterSkillIdentity {
  owner: string
  repo: string
  name: string
}

export interface ParsedClusterSkillKey extends ClusterSkillIdentity {
  key: string
}

const LEADING_SKILL_COUNT = 3

/**
 * The `owner/repo/name` key a pin is written in. A Skill name repeats across
 * repositories, even under one owner, so a key without the repository can
 * match two Skills.
 */
export function clusterSkillKey(skill: ClusterSkillIdentity): string {
  return `${skill.owner}/${skill.repo}/${skill.name}`
}

export function parseClusterSkillKeys(keys: string[]): ParsedClusterSkillKey[] {
  return keys.map((key) => {
    const parts = key.split('/')
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2])
      throw new Error(`Invalid cluster skill key, expected owner/repo/name: ${key}`)

    return { key, owner: parts[0], repo: parts[1], name: parts[2] }
  })
}

export function curateClusterSkills<T extends ClusterSkillIdentity>(
  skills: T[],
  pinnedExamples: string[],
): T[] {
  const pinRank = new Map(pinnedExamples.map((key, index) => [key, index]))
  const ranked = skills
    .map((skill, index) => ({ skill, index, pinRank: pinRank.get(clusterSkillKey(skill)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.pinRank - b.pinRank || a.index - b.index)
    .map(entry => entry.skill)

  const leading: T[] = []
  const deferred: T[] = []
  const leadingOwners = new Set<string>()

  for (const skill of ranked) {
    if (leading.length < LEADING_SKILL_COUNT && !leadingOwners.has(skill.owner)) {
      leading.push(skill)
      leadingOwners.add(skill.owner)
    }
    else {
      deferred.push(skill)
    }
  }

  return [...leading, ...deferred]
}
