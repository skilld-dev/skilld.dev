import type { GitHubRepository } from '~~/shared/github-repository'
import type { IndexedRepositorySkill, RepositoryIndexProgress } from '~~/shared/repository-index'

interface RepositoryJobRow {
  payload: string
  completed_at: number | null
  failed_at: number | null
  last_error: string | null
  progress_job_id: string | null
  tree_sha: string | null
  next_offset: number | null
  total_skills: number | null
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
    `SELECT
       name,
       slug,
       rendered_skill_path AS path,
       description,
       COALESCE(like_count, 0) AS likeCount
     FROM skills
     WHERE owner = ? AND repo = ? AND source_resolved = 1
     ORDER BY name`,
  ).bind(repository.owner, repository.repo).all<IndexedRepositorySkill>()
  return result.results ?? []
}

export type RepositoryJobState
  = | { _tag: 'missing' }
    | { _tag: 'queued', repository: GitHubRepository, progress: RepositoryIndexProgress }
    | { _tag: 'complete', repository: GitHubRepository }
    | { _tag: 'failed', repository: GitHubRepository, reason: string }

export async function readRepositoryJobState(
  db: D1Database,
  jobId: string,
): Promise<RepositoryJobState> {
  const active = await db.prepare(
    `SELECT
       j.payload,
       j.completed_at,
       j.failed_at,
       j.last_error,
       p.job_id AS progress_job_id,
       p.tree_sha,
       p.next_offset,
       p.total_skills
     FROM jobs j
     LEFT JOIN repo_sync_progress p ON p.job_id = j.id
     WHERE j.id = ? AND j.job_type = 'registry/repository-submission'`,
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
      ? { _tag: 'queued', repository, progress: repositoryJobProgress(active) }
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

function repositoryJobProgress(row: RepositoryJobRow): RepositoryIndexProgress {
  if (row.progress_job_id == null)
    return { _tag: 'queued' }
  if (row.tree_sha == null || row.total_skills == null)
    return { _tag: 'checking' }
  return {
    _tag: 'indexing',
    indexed: Math.min(row.next_offset ?? 0, row.total_skills),
    total: row.total_skills,
  }
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
  if (reason?.includes('tree_truncated') || reason?.includes('repo_too_large_to_index'))
    return 'This repository is too large to index safely.'
  return 'Repository indexing failed. Try again.'
}
