import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRepoSummary } from '../../layers/registry/server/utils/github-client'
import { readRepositoryPurposeEvidence } from '../../layers/registry/server/utils/repository-purpose-effect'

describe('github repository identity', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hides a private repository even when the read credential can access it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      data: { repository: { databaseId: 1, isPrivate: true, name: 'private', nameWithOwner: 'acme/private', owner: { login: 'acme' }, defaultBranchRef: null } },
    })))
    expect(await getRepoSummary('acme', 'private', {})).toMatchObject({ status: 404, data: null })
  })

  it('fails closed when the source omits repository visibility', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      data: { repository: { databaseId: 1, name: 'unknown', nameWithOwner: 'acme/unknown', owner: { login: 'acme' }, defaultBranchRef: null } },
    })))
    expect(await getRepoSummary('acme', 'unknown', {})).toMatchObject({ status: 502, data: null })
  })

  it('stops purpose evidence before reading any private tree or file', async () => {
    const fetch = vi.fn(async () => Response.json({
      data: { repository: { databaseId: 1, isPrivate: true, name: 'private', owner: { login: 'acme' }, defaultBranchRef: null } },
    }))
    vi.stubGlobal('fetch', fetch)
    await expect(readRepositoryPurposeEvidence({ owner: 'acme', repo: 'private' }, {}))
      .rejects
      .toThrow('Repository purpose source unavailable: 404')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

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
          isPrivate: false,
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
