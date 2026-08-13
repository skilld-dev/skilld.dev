import { describe, expect, it } from 'vitest'
import {
  readRepositoryJobState,
  repositoryIndexFailureMessage,
} from '../../layers/registry/server/utils/repository-index'

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
