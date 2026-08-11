import type { GitHubRepository } from '~~/shared/github-repository'
import type { IndexedRepositorySkill } from '~~/shared/repository-index'

interface RepositoryJobRow {
  payload: string
  completed_at: number | null
  failed_at: number | null
  last_error: string | null
}

interface FailedRepositoryJobRow {
  payload: string
  exception: string
}

export async function findIndexedRepositorySkills(
  db: D1Database,
  repository: Pick<GitHubRepository, 'owner' | 'repo'>,
): Promise<IndexedRepositorySkill[]> {
  const result = await db.prepare(
    `SELECT name, slug
     FROM skills
     WHERE owner = ? AND repo = ? AND source_resolved = 1
     ORDER BY name`,
  ).bind(repository.owner, repository.repo).all<IndexedRepositorySkill>()
  return result.results ?? []
}

export type RepositoryJobState
  = | { _tag: 'missing' }
    | { _tag: 'queued', repository: GitHubRepository }
    | { _tag: 'complete', repository: GitHubRepository }
    | { _tag: 'failed', repository: GitHubRepository, reason: string }

export async function readRepositoryJobState(
  db: D1Database,
  jobId: string,
): Promise<RepositoryJobState> {
  const active = await db.prepare(
    `SELECT payload, completed_at, failed_at, last_error
     FROM jobs
     WHERE id = ? AND job_type = 'registry/repository-submission'`,
  ).bind(jobId).first<RepositoryJobRow>()

  if (active) {
    const repository = repositoryFromJobPayload(active.payload)
    if (!repository)
      return { _tag: 'missing' }
    if (active.failed_at != null) {
      return {
        _tag: 'failed',
        repository,
        reason: repositoryIndexFailureMessage(active.last_error),
      }
    }
    return active.completed_at == null
      ? { _tag: 'queued', repository }
      : { _tag: 'complete', repository }
  }

  const failed = await db.prepare(
    `SELECT payload, exception
     FROM failed_jobs
     WHERE id = ? AND job_type = 'registry/repository-submission'`,
  ).bind(jobId).first<FailedRepositoryJobRow>()
  if (!failed)
    return { _tag: 'missing' }
  const repository = repositoryFromJobPayload(failed.payload)
  return repository
    ? {
        _tag: 'failed',
        repository,
        reason: repositoryIndexFailureMessage(failed.exception),
      }
    : { _tag: 'missing' }
}

function repositoryFromJobPayload(payload: string): GitHubRepository | null {
  const value = JSON.parse(payload) as Record<string, unknown>
  if (
    value._task !== 'registry/repository-submission'
    || value.operation !== 'submit'
    || typeof value.owner !== 'string'
    || typeof value.repo !== 'string'
  ) {
    return null
  }
  return {
    _tag: 'repository',
    owner: value.owner,
    repo: value.repo,
    url: `https://github.com/${value.owner}/${value.repo}`,
  }
}

export function repositoryIndexFailureMessage(reason: string | null | undefined): string {
  if (reason?.includes('repo fetch 404') || reason?.includes('repo fetch 410'))
    return 'GitHub repository was not found.'
  if (reason?.includes('no_supported_skill_paths') || reason?.includes('root_skill_unsupported'))
    return 'No supported SKILL.md files were found.'
  if (reason?.includes('skill_parse_rejected:'))
    return 'A SKILL.md file could not be indexed.'
  if (reason?.includes('tree_truncated'))
    return 'This repository is too large to index safely.'
  return 'Repository indexing failed. Try again.'
}
