export interface RepoSkillGroup<T> {
  key: string
  label: string
  skills: T[]
}

interface NamedSkill {
  name: string
}

function formatGroupLabel(key: string): string {
  const words = key.replace(/[-_]+/g, ' ').trim()
  return words ? `${words[0]!.toUpperCase()}${words.slice(1)}` : 'Other'
}

function groupKeyFromPath(path: string): { groupKey: string, skillName: string } | null {
  const parts = path.split('/').filter(Boolean)
  if (parts.at(-1)?.toLowerCase() !== 'skill.md')
    return null

  const skillName = parts.at(-2)?.toLowerCase()
  if (!skillName)
    return null

  const parent = parts.at(-3)?.toLowerCase()
  return {
    groupKey: !parent || parent === 'skills' ? 'skills' : parent,
    skillName,
  }
}

function sourcePriority(groupKey: string): number {
  if (groupKey === 'deprecated')
    return 2
  if (groupKey === 'in-progress')
    return 1
  return 0
}

function groupOrder(key: string): number {
  if (key === 'other')
    return 2
  if (key === 'deprecated')
    return 1
  return 0
}

export function groupRepoSkills<T extends NamedSkill>(skills: T[], sourcePaths: string[]): RepoSkillGroup<T>[] {
  const sourceGroupBySkill = new Map<string, string>()

  for (const path of sourcePaths) {
    const source = groupKeyFromPath(path)
    if (!source)
      continue

    const existing = sourceGroupBySkill.get(source.skillName)
    if (!existing || sourcePriority(source.groupKey) < sourcePriority(existing))
      sourceGroupBySkill.set(source.skillName, source.groupKey)
  }

  const grouped = new Map<string, T[]>()
  for (const skill of skills) {
    const key = sourceGroupBySkill.get(skill.name.toLowerCase()) ?? 'other'
    const groupSkills = grouped.get(key) ?? []
    groupSkills.push(skill)
    grouped.set(key, groupSkills)
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => groupOrder(a) - groupOrder(b) || a.localeCompare(b))
    .map(([key, groupSkills]) => ({
      key,
      label: formatGroupLabel(key),
      skills: groupSkills,
    }))
}

export function hasRepoFolderGrouping<T>(groups: RepoSkillGroup<T>[]): boolean {
  return groups.some(group => group.key !== 'other' && group.key !== 'skills')
}
