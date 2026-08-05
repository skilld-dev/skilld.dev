export interface RelatedSkillIdentity {
  owner: string
  repo: string
  name: string
  displayName: string
  description: string | null
}

function relatedSkillKey(skill: Pick<RelatedSkillIdentity, 'owner' | 'repo' | 'name'>): string {
  return `${skill.owner}/${skill.repo}/${skill.name}`
}

export function relatedSkillSearchQuery(skill: RelatedSkillIdentity): string {
  return [skill.displayName.trim() || skill.name, skill.description?.trim()]
    .filter((part): part is string => Boolean(part))
    .join('\n')
}

export function selectRelatedSkillFallbacks<T extends RelatedSkillIdentity>(
  current: RelatedSkillIdentity,
  candidates: T[],
  limit = 6,
): T[] {
  const currentKey = relatedSkillKey(current)
  const seen = new Set<string>([currentKey])
  const seenNames = new Set<string>([current.name.toLowerCase()])
  const selected: T[] = []

  for (const candidate of candidates) {
    const key = relatedSkillKey(candidate)
    const name = candidate.name.toLowerCase()
    if (seen.has(key) || seenNames.has(name))
      continue
    seen.add(key)
    seenNames.add(name)
    selected.push(candidate)
    if (selected.length === limit)
      break
  }

  return selected
}

/**
 * The related-skills response is cached whole, not just its commits.
 *
 * Every uncached request costs roughly six D1 reads (skill, source identity,
 * same-repo and same-owner relations, co-occurrence, neighbor hydration, plus a
 * search fallback when the index has no neighbors yet). On 2026-08-04 one hot
 * skill produced 839 `D1 DB is overloaded` errors in a single hour while 879
 * skills were being ingested. Related skills only change when the registry does,
 * so an hour of staleness is cheap next to that.
 */
export const RELATED_CACHE_TTL = 60 * 60
const RELATED_CACHE_VERSION = 'v1'

export function relatedCacheKey(
  skill: { owner: string, repo: string, name: string },
): string {
  return `skills:related:${RELATED_CACHE_VERSION}:${skill.owner}/${skill.repo}/${skill.name}`
}
