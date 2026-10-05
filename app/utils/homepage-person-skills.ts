import type { SkillSourceItem } from '../types/skill-source'
import { formatGithubStars } from './github-stars'

/** Ceiling on the hero rail; twenty rows fill the stream without ten extra avatars. */
export const HOMEPAGE_SKILL_LIMIT = 20
/**
 * Below this many separate authors the trending feed is too thin to lead the
 * rail, and the evergreen person-authored set takes over instead.
 */
export const HOMEPAGE_TRENDING_MINIMUM = 6
/** Below this many people the live person feed loses to the hand-picked fallbacks. */
export const HOMEPAGE_PERSON_MINIMUM = 10

export interface FeaturedPersonSkill {
  owner: string
  repo: string
  name: string
  displayName: string
  description: string | null
  stars: number
  registryPath: string
}

export interface FeaturedPersonSection {
  owner: string
  repo: string
  displayName: string
  skills: FeaturedPersonSkill[]
}

export type HomepageTrendingSelection
  = | { _tag: 'trending', items: readonly SkillSourceItem[] }
    | { _tag: 'fallback' }

/**
 * One skill per author, first occurrence wins.
 *
 * The rail is a list of people as much as a list of skills: a repository with
 * ten skills used to fill ten consecutive rows with the same face, which read
 * as one author dominating the week rather than as ten things worth reading.
 */
export function uniqueByOwner(items: readonly SkillSourceItem[]): SkillSourceItem[] {
  const seen = new Set<string>()
  const result: SkillSourceItem[] = []
  for (const item of items) {
    if (seen.has(item.owner))
      continue
    seen.add(item.owner)
    result.push(item)
  }
  return result
}

/**
 * Hero rail from the trending feed, one skill per author, padded with the
 * evergreen fallbacks so the stream stays deep enough to scroll.
 *
 * `fallback` when fewer than HOMEPAGE_TRENDING_MINIMUM authors are trending:
 * the caller then loads the live person feed instead.
 */
export function selectHomepageTrendingSkills(
  trending: readonly Omit<SkillSourceItem, 'maintainerName'>[],
  fallbacks: readonly SkillSourceItem[],
): HomepageTrendingSelection {
  const namesByOwner = new Map(fallbacks.map(item => [item.owner, item.maintainerName ?? item.owner]))
  const unique = uniqueByOwner(trending.map(item => ({
    ...item,
    maintainerName: namesByOwner.get(item.owner) ?? item.owner,
  })))
  if (unique.length < HOMEPAGE_TRENDING_MINIMUM)
    return { _tag: 'fallback' }

  const owners = new Set(unique.map(item => item.owner))
  const padding = uniqueByOwner(fallbacks).filter(item => !owners.has(item.owner))
  return { _tag: 'trending', items: [...unique, ...padding].slice(0, HOMEPAGE_SKILL_LIMIT) }
}

interface PersonSkillBucket {
  owner: string
  displayName: string
  skills: FeaturedPersonSkill[]
}

/** The live person feed as rail rows: each person's most-starred skill, one row each. */
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
      if (skill.name === 'skill' || seenSkills.has(key))
        continue

      seenSkills.add(key)
      bucket.skills.push(skill)
    }

    if (!existing)
      buckets.set(section.owner, bucket)
  }

  const result: SkillSourceItem[] = []

  for (const person of buckets.values()) {
    const skill = [...person.skills]
      .sort((left, right) => right.stars - left.stars || left.name.localeCompare(right.name))[0]
    if (!skill)
      continue

    result.push({
      owner: skill.owner,
      repo: skill.repo,
      name: skill.name,
      displayName: skill.displayName,
      registryPath: skill.registryPath,
      maintainerName: person.displayName !== person.owner
        ? person.displayName
        : fallbackNamesByOwner.get(person.owner) ?? person.owner,
      description: skill.description,
      context: skill.stars > 0 ? `${formatGithubStars(skill.stars)} GitHub stars` : null,
    })

    if (result.length === HOMEPAGE_SKILL_LIMIT)
      break
  }

  return result
}
