import type { SkillSourceItem } from '../types/skill-source'

export const HOMEPAGE_SKILL_LIMIT = 20
export const HOMEPAGE_PERSON_MINIMUM = 10

const HOMEPAGE_SKILLS_PER_PERSON = 2

export interface FeaturedPersonSkill {
  owner: string
  repo: string
  name: string
  displayName: string
  description: string | null
  installs: number
}

export interface FeaturedPersonSection {
  owner: string
  repo: string
  displayName: string
  skills: FeaturedPersonSkill[]
}

interface PersonSkillBucket {
  owner: string
  displayName: string
  skills: FeaturedPersonSkill[]
}

function formatCompactCount(count: number): string {
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (count >= 1_000)
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return count.toLocaleString()
}

export function selectHomepagePersonSkills(
  sections: readonly FeaturedPersonSection[],
  fallbackNamesByOwner: ReadonlyMap<string, string>,
): SkillSourceItem[] {
  const buckets = new Map<string, PersonSkillBucket>()
  const seenSkills = new Set<string>()

  for (const section of sections) {
    const existing = buckets.get(section.owner)
    const bucket = existing ?? {
      owner: section.owner,
      displayName: section.displayName,
      skills: [],
    }

    if (bucket.displayName === bucket.owner && section.displayName !== section.owner)
      bucket.displayName = section.displayName

    for (const skill of section.skills) {
      const key = `${skill.owner}/${skill.repo}/${skill.name}`
      if (skill.name === 'skill' || skill.installs <= 0 || seenSkills.has(key))
        continue

      seenSkills.add(key)
      bucket.skills.push(skill)
    }

    if (!existing)
      buckets.set(section.owner, bucket)
  }

  const people = [...buckets.values()]
    .map(person => ({
      ...person,
      skills: [...person.skills]
        .sort((left, right) => right.installs - left.installs)
        .slice(0, HOMEPAGE_SKILLS_PER_PERSON),
    }))
    .filter(person => person.skills.length > 0)

  const result: SkillSourceItem[] = []

  for (let skillIndex = 0; skillIndex < HOMEPAGE_SKILLS_PER_PERSON; skillIndex++) {
    for (const person of people) {
      const skill = person.skills[skillIndex]
      if (!skill)
        continue

      result.push({
        owner: skill.owner,
        repo: skill.repo,
        name: skill.name,
        displayName: skill.displayName,
        maintainerName: person.displayName !== person.owner
          ? person.displayName
          : fallbackNamesByOwner.get(person.owner) ?? person.owner,
        description: skill.description,
        context: `${formatCompactCount(skill.installs)} weekly installs`,
      })

      if (result.length === HOMEPAGE_SKILL_LIMIT)
        return result
    }
  }

  return result
}
