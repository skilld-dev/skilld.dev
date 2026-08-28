import type { SkillBadgeEmbedInput } from '~~/shared/skill-badge'
import { repoHubPath, repoSkillPath } from '~~/shared/skill-routes'

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
  const registryPath = target._tag === 'repository' || target.repositorySkillCount === 1
    ? repositoryPath
    : repoSkillPath(target.owner, target.repo, target.name)

  return {
    owner: target.owner,
    repo: target.repo,
    name: target.name,
    registryPath,
  }
}
