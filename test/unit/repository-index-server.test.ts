import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readRepositoryJobState,
  repositoryIndexFailureMessage,
  submitRepositoryIndex,
} from '../../layers/registry/server/utils/repository-index'

const jobs = vi.hoisted(() => ({
  enqueueRegistryRepoJob: vi.fn(async () => ({ jobId: 'job-1', status: 'queued' as const })),
}))

vi.mock('../../server/utils/registry-jobs-runtime', () => jobs)

function jobDatabase(row: Record<string, unknown> | null): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => row,
      }),
    }),
  } as unknown as D1Database
}

describe('repository indexing job state', () => {
  it('reads a public submission as queued work', async () => {
    const result = await readRepositoryJobState(jobDatabase({
      payload: JSON.stringify({
        _task: 'registry/repository-submission',
        operation: 'submit',
        owner: 'jonathanxdr',
        repo: 'nuxt-style-readme-skill',
      }),
      completed_at: null,
      failed_at: null,
      last_error: null,
      progress_job_id: null,
      tree_sha: null,
      next_offset: null,
      total_skills: null,
    }), 'job-1')

    expect(result).toMatchObject({
      _tag: 'queued',
      repository: { owner: 'jonathanxdr', repo: 'nuxt-style-readme-skill' },
      progress: { _tag: 'queued' },
    })
  })

  it('reports checked repository progress while skill files are indexed', async () => {
    const result = await readRepositoryJobState(jobDatabase({
      payload: JSON.stringify({
        _task: 'registry/repository-submission',
        operation: 'submit',
        owner: 'jonathanxdr',
        repo: 'nuxt-style-readme-skill',
      }),
      completed_at: null,
      failed_at: null,
      last_error: null,
      progress_job_id: 'job-1',
      tree_sha: 'tree-sha',
      next_offset: 50,
      total_skills: 72,
    }), 'job-1')

    expect(result).toMatchObject({
      _tag: 'queued',
      progress: { _tag: 'indexing', indexed: 50, total: 72 },
    })
  })

  it.each([
    ['repo fetch 404', 'GitHub repository was not found.'],
    ['no_supported_skill_paths', 'No supported SKILL.md files were found.'],
    ['skill_parse_rejected:skills/example/SKILL.md', 'A SKILL.md file could not be indexed.'],
    ['upstream unavailable', 'Repository indexing failed. Try again.'],
  ])('turns %s into a safe public failure', (reason, message) => {
    expect(repositoryIndexFailureMessage(reason)).toBe(message)
  })
})

describe('repository index requests', () => {
  const now = 1_800_000_000
  const repository = { _tag: 'repository', owner: 'acme', repo: 'skills', url: 'https://github.com/acme/skills' } as const

  function indexedDatabase(lastCheckedAt: number | null): D1Database {
    return {
      prepare: (sql: string) => ({
        bind: () => ({
          all: async () => ({
            results: [{ name: 'one', slug: 'acme/one', path: 'skills/one/SKILL.md', description: 'One', likeCount: 0 }],
          }),
          first: async () => sql.includes('repo_meta_synced_at') ? { repo_meta_synced_at: lastCheckedAt } : null,
        }),
      }),
    } as unknown as D1Database
  }

  beforeEach(() => {
    jobs.enqueueRegistryRepoJob.mockClear()
  })

  it('queues a resubmission when an indexed repository was last checked over fifteen minutes ago', async () => {
    const result = await submitRepositoryIndex({ db: indexedDatabase(now - 16 * 60), env: {} } as never, repository, now)

    expect(result).toMatchObject({ _tag: 'indexed', skills: [{ name: 'one' }] })
    expect(jobs.enqueueRegistryRepoJob).toHaveBeenCalledWith({}, { operation: 'submit', owner: 'acme', repo: 'skills' })
  })

  it('answers from stored Skills without queueing work when the repository was checked recently', async () => {
    const result = await submitRepositoryIndex({ db: indexedDatabase(now - 60), env: {} } as never, repository, now)

    expect(result).toMatchObject({ _tag: 'indexed', skills: [{ name: 'one' }] })
    expect(jobs.enqueueRegistryRepoJob).not.toHaveBeenCalled()
  })
})
