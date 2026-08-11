import type { GitHubRepository } from '../../shared/github-repository'
import type {
  RepositoryIndexStatusResponse,
  SubmitRepositoryIndexResponse,
} from '../../shared/repository-index'

export type RepositoryIndexResult
  = | Extract<RepositoryIndexStatusResponse, { _tag: 'indexed' | 'failed' }>
    | { _tag: 'timed_out', repository: GitHubRepository }

export interface RepositoryIndexDependencies {
  submit: (repository: GitHubRepository) => Promise<SubmitRepositoryIndexResponse>
  status: (jobId: string) => Promise<RepositoryIndexStatusResponse>
  wait: () => Promise<void>
}

export async function indexGitHubRepository(
  repository: GitHubRepository,
  dependencies: RepositoryIndexDependencies,
  options: { maxPolls?: number } = {},
): Promise<RepositoryIndexResult> {
  const submitted = await dependencies.submit(repository)
  if (submitted._tag === 'indexed')
    return submitted

  const maxPolls = options.maxPolls ?? 80
  for (let poll = 0; poll < maxPolls; poll++) {
    const status = await dependencies.status(submitted.jobId)
    if (status._tag !== 'queued')
      return status
    if (poll < maxPolls - 1)
      await dependencies.wait()
  }

  return { _tag: 'timed_out', repository }
}
