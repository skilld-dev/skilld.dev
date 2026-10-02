import type { indexRequestsV1, OperationResult } from 'skilld-sdk/contract'
import type { GitHubRepository, GitHubRepositoryParseResult } from '#shared/github-repository'
import type {
  RepositoryIndexProgress,
  RepositoryIndexStatusResponse,
  SubmitRepositoryIndexResponse,
} from '#shared/repository-index'
import type { SkillCardSource } from '#shared/server/skill-cards'
import { parseGitHubRepositoryUrl } from '#shared/github-repository'
import { presentCount, presentSkillSummaries } from '#shared/server/skill-cards'

const REPOSITORY_SHORTHAND = /^[\w.-]+\/[\w.-]+$/

/**
 * `owner/repository` or a github.com URL, read the way the skilld.dev search
 * box reads a pasted URL, so both routes index the same Repository for the
 * same text.
 */
export function parseRepositoryReference(value: string): GitHubRepositoryParseResult {
  const trimmed = value.trim()
  return parseGitHubRepositoryUrl(REPOSITORY_SHORTHAND.test(trimmed) ? `https://github.com/${trimmed}` : trimmed)
}

type IndexedSkillCards = ReadonlyMap<string, SkillCardSource>

/** The registry rows behind an `indexed` answer, in the answer's order. */
export function indexedSkillKeys(repository: GitHubRepository, skills: readonly { name: string }[]) {
  return skills.map(skill => ({ owner: repository.owner, repo: repository.repo, name: skill.name }))
}

function presentIndexed(repository: GitHubRepository, skills: readonly { name: string }[], cards: IndexedSkillCards) {
  const rows = indexedSkillKeys(repository, skills)
    .map(key => cards.get(`${key.owner}/${key.repo}/${key.name}`))
    .filter((card): card is SkillCardSource => card !== undefined)
  return {
    status: 'indexed' as const,
    owner: repository.owner,
    repository: repository.repo,
    skills: presentSkillSummaries(rows),
  }
}

function presentProgress(progress: RepositoryIndexProgress) {
  if (progress._tag === 'indexing')
    return { stage: 'indexing' as const, indexed: presentCount(progress.indexed), total: presentCount(progress.total) }
  return { stage: progress._tag }
}

function presentQueued(repository: GitHubRepository, id: string, progress: RepositoryIndexProgress) {
  return {
    status: 'queued' as const,
    id,
    owner: repository.owner,
    repository: repository.repo,
    progress: presentProgress(progress),
  }
}

export function presentIndexRequestCreated(
  answer: SubmitRepositoryIndexResponse,
  cards: IndexedSkillCards,
): OperationResult<typeof indexRequestsV1.operations.create> {
  return answer._tag === 'indexed'
    ? presentIndexed(answer.repository, answer.skills, cards)
    : presentQueued(answer.repository, answer.jobId, answer.progress)
}

export function presentIndexRequest(
  id: string,
  answer: RepositoryIndexStatusResponse,
  cards: IndexedSkillCards,
): OperationResult<typeof indexRequestsV1.operations.get> {
  if (answer._tag === 'indexed')
    return presentIndexed(answer.repository, answer.skills, cards)
  if (answer._tag === 'queued')
    return presentQueued(answer.repository, id, answer.progress)
  return {
    status: 'failed',
    owner: answer.repository.owner,
    repository: answer.repository.repo,
    reason: answer.reason,
  }
}
