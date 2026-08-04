export type RepoSkillSort = 'added' | 'updated' | 'name'

interface SortableRepoSkill {
  name: string
  firstSeenAt?: number | null
  modifiedAt?: number | null
}

export const REPO_SKILL_SORT_OPTIONS: { label: string, value: RepoSkillSort }[] = [
  { label: 'Recently added', value: 'added' },
  { label: 'Recently updated', value: 'updated' },
  { label: 'Name', value: 'name' },
]

export function parseRepoSkillSort(value: unknown): RepoSkillSort {
  return value === 'updated' || value === 'name' ? value : 'added'
}

function compareTimestampDescending(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null)
    return 0
  if (a == null)
    return 1
  if (b == null)
    return -1
  return b - a
}

export function sortRepoSkills<T extends SortableRepoSkill>(skills: readonly T[], sort: RepoSkillSort): T[] {
  return [...skills].sort((a, b) => {
    const timeOrder = sort === 'added'
      ? compareTimestampDescending(a.firstSeenAt, b.firstSeenAt)
      : sort === 'updated'
        ? compareTimestampDescending(a.modifiedAt, b.modifiedAt)
        : 0

    return timeOrder || a.name.localeCompare(b.name)
  })
}
