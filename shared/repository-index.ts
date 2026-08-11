import type { GitHubRepository } from './github-repository'

export interface IndexedRepositorySkill {
  name: string
  slug: string
}

export type SubmitRepositoryIndexResponse
  = | {
    _tag: 'indexed'
    repository: GitHubRepository
    skills: IndexedRepositorySkill[]
  }
  | {
    _tag: 'queued'
    repository: GitHubRepository
    jobId: string
  }

export type RepositoryIndexStatusResponse
  = | {
    _tag: 'queued'
    repository: GitHubRepository
  }
  | {
    _tag: 'indexed'
    repository: GitHubRepository
    skills: IndexedRepositorySkill[]
  }
  | {
    _tag: 'failed'
    repository: GitHubRepository
    reason: string
  }
