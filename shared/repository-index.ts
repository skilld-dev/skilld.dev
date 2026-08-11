import type { GitHubRepository } from './github-repository'

export interface IndexedRepositorySkill {
  name: string
  slug: string
}

export type RepositoryIndexProgress
  = | { _tag: 'queued' }
    | { _tag: 'checking' }
    | { _tag: 'indexing', indexed: number, total: number }

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
    progress: RepositoryIndexProgress
  }

export type RepositoryIndexStatusResponse
  = | {
    _tag: 'queued'
    repository: GitHubRepository
    progress: RepositoryIndexProgress
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
