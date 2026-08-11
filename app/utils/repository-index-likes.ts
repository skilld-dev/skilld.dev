import type { IndexedRepositorySkill } from '#shared/repository-index'

export interface IndexedSkillLikeRef {
  owner: string
  repo: string
  name: string
}

export type IndexedSkillsLikeResult
  = | { _tag: 'anonymous' }
    | { _tag: 'liked' }
    | { _tag: 'partial', failed: IndexedSkillLikeRef[] }

export interface IndexedSkillsLikeDependencies {
  authenticated: boolean
  ensureLiked: (ref: IndexedSkillLikeRef) => Promise<boolean>
}

export async function likeIndexedSkills(
  repository: Pick<IndexedSkillLikeRef, 'owner' | 'repo'>,
  skills: IndexedRepositorySkill[],
  dependencies: IndexedSkillsLikeDependencies,
): Promise<IndexedSkillsLikeResult> {
  if (!dependencies.authenticated)
    return { _tag: 'anonymous' }

  const refs = skills.map(skill => ({ ...repository, name: skill.name }))
  const outcomes = await Promise.all(refs.map(dependencies.ensureLiked))
  const failed = refs.filter((_, index) => !outcomes[index])

  return failed.length ? { _tag: 'partial', failed } : { _tag: 'liked' }
}
