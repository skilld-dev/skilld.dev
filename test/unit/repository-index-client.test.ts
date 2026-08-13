import type { GitHubRepository } from '../../shared/github-repository'
import { describe, expect, it, vi } from 'vitest'
import { indexGitHubRepository } from '../../app/utils/repository-index'

const repository: GitHubRepository = {
  _tag: 'repository',
  owner: 'jonathanxdr',
  repo: 'nuxt-style-readme-skill',
  url: 'https://github.com/jonathanxdr/nuxt-style-readme-skill',
}

describe('indexGitHubRepository', () => {
  it('returns existing indexed skills without polling', async () => {
    const status = vi.fn()

    const result = await indexGitHubRepository(repository, {
      submit: async () => ({
        _tag: 'indexed',
        repository,
        skills: [{ name: 'nuxt-style-readme', slug: 'jonathanxdr/nuxt-style-readme', path: 'skills/nuxt-style-readme/SKILL.md', description: null, likeCount: 0 }],
      }),
      status,
      wait: async () => {},
    })

    expect(result._tag).toBe('indexed')
    expect(status).not.toHaveBeenCalled()
  })

  it('polls queued work until the skill is indexed', async () => {
    const status = vi.fn()
      .mockResolvedValueOnce({
        _tag: 'queued',
        repository,
        progress: { _tag: 'checking' },
      })
      .mockResolvedValueOnce({
        _tag: 'indexed',
        repository,
        skills: [{ name: 'nuxt-style-readme', slug: 'jonathanxdr/nuxt-style-readme', path: 'skills/nuxt-style-readme/SKILL.md', description: null, likeCount: 0 }],
      })

    const result = await indexGitHubRepository(repository, {
      submit: async () => ({
        _tag: 'queued',
        repository,
        jobId: 'job-1',
        progress: { _tag: 'queued' },
      }),
      status,
      wait: async () => {},
    })

    expect(result).toMatchObject({ _tag: 'indexed', skills: [{ name: 'nuxt-style-readme' }] })
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('reports every durable stage while polling', async () => {
    const onProgress = vi.fn()

    await indexGitHubRepository(repository, {
      submit: async () => ({
        _tag: 'queued',
        repository,
        jobId: 'job-1',
        progress: { _tag: 'queued' },
      }),
      status: vi.fn()
        .mockResolvedValueOnce({
          _tag: 'queued',
          repository,
          progress: { _tag: 'checking' },
        })
        .mockResolvedValueOnce({
          _tag: 'queued',
          repository,
          progress: { _tag: 'indexing', indexed: 50, total: 72 },
        })
        .mockResolvedValueOnce({ _tag: 'indexed', repository, skills: [] }),
      wait: async () => {},
      onProgress,
    })

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { _tag: 'queued' },
      { _tag: 'checking' },
      { _tag: 'indexing', indexed: 50, total: 72 },
    ])
  })

  it('returns a visible failure from the job', async () => {
    const result = await indexGitHubRepository(repository, {
      submit: async () => ({
        _tag: 'queued',
        repository,
        jobId: 'job-1',
        progress: { _tag: 'queued' },
      }),
      status: async () => ({
        _tag: 'failed',
        repository,
        reason: 'No supported SKILL.md files were found.',
      }),
      wait: async () => {},
    })

    expect(result).toEqual({
      _tag: 'failed',
      repository,
      reason: 'No supported SKILL.md files were found.',
    })
  })

  it('stops polling after the configured limit', async () => {
    const result = await indexGitHubRepository(repository, {
      submit: async () => ({
        _tag: 'queued',
        repository,
        jobId: 'job-1',
        progress: { _tag: 'queued' },
      }),
      status: async () => ({
        _tag: 'queued',
        repository,
        progress: { _tag: 'checking' },
      }),
      wait: async () => {},
    }, { maxPolls: 2 })

    expect(result).toEqual({ _tag: 'timed_out', repository })
  })
})
