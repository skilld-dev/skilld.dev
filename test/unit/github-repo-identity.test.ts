import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRepoSummary } from '../../layers/registry/server/utils/github-client'

describe('github repository identity', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns GitHub canonical identity when an old repository name resolves', async () => {
    const fetch = vi.fn(async () => Response.json({
      data: {
        repository: {
          databaseId: 1072000123,
          name: 'openclaw',
          nameWithOwner: 'openclaw/openclaw',
          url: 'https://github.com/openclaw/openclaw',
          owner: { login: 'openclaw' },
          description: 'Skills',
          stargazerCount: 1,
          forkCount: 0,
          pushedAt: '2026-07-12T12:00:00Z',
          createdAt: '2025-01-01T00:00:00Z',
          isArchived: false,
          isFork: false,
          defaultBranchRef: {
            name: 'main',
            target: { oid: 'commit', tree: { oid: 'tree' } },
          },
        },
      },
    }))
    vi.stubGlobal('fetch', fetch)

    const result = await getRepoSummary('steipete', 'clawdis', {})

    expect(result.data?.meta).toMatchObject({
      name: 'openclaw',
      full_name: 'openclaw/openclaw',
      html_url: 'https://github.com/openclaw/openclaw',
      owner: { login: 'openclaw' },
    })
    expect(result.data?.repositoryId).toBe(1072000123)
    expect(fetch.mock.calls[0]?.[1]?.body).toContain('nameWithOwner')
  })

  it('fails the read when GitHub names no Repository ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      data: { repository: { databaseId: null, name: 'skills', nameWithOwner: 'acme/skills', owner: { login: 'acme' } } },
    })))

    const result = await getRepoSummary('acme', 'skills', {})

    expect(result).toMatchObject({ status: 502, data: null })
  })
})
