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
