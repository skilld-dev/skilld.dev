import type { SkillBadgeEmbedInput } from '~~/shared/skill-badge'
import { canonicalRepoSkillPath, repoHubPath } from '~~/shared/skill-routes'

export type AuthorBadgeTarget
  = | {
    _tag: 'repository'
    owner: string
    repo: string
    name: string
  }
  | {
    _tag: 'skill'
    owner: string
    repo: string
    name: string
    repositorySkillCount: number
  }

export function authorBadgeInput(target: AuthorBadgeTarget): SkillBadgeEmbedInput {
  const repositoryPath = repoHubPath(target.owner, target.repo)
  const registryPath = target._tag === 'repository'
    ? repositoryPath
    : canonicalRepoSkillPath({
        owner: target.owner,
        repo: target.repo,
        name: target.name,
        repoSkillCount: target.repositorySkillCount,
      })

  return {
    owner: target.owner,
    repo: target.repo,
    name: target.name,
    registryPath,
  }
}
