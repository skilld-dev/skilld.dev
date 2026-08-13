// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { syncStarredRepos } from '../../layers/identity/app/utils/sync-starred-repos'

describe('syncStarredRepos', () => {
  it('posts the page in the request body and follows pagination', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        page: 1,
        fetched: 100,
        total: 8,
        matched: 2,
        hasMore: true,
        syncedAt: null,
      })
      .mockResolvedValueOnce({
        ok: true,
        page: 2,
        fetched: 0,
        total: 8,
        matched: 2,
        hasMore: false,
        syncedAt: 1_786_000_000,
      })

    const result = await syncStarredRepos(fetchPage)

    expect(fetchPage).toHaveBeenNthCalledWith(1, '/api/me/stars/sync', {
      method: 'POST',
      body: { page: 1 },
    })
    expect(fetchPage).toHaveBeenNthCalledWith(2, '/api/me/stars/sync', {
      method: 'POST',
      body: { page: 2 },
    })
    expect(result.syncedAt).toBe(1_786_000_000)
  })

  it('completes when the user has no matching starred repositories', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      ok: true,
      page: 1,
      fetched: 0,
      total: 0,
      matched: 0,
      hasMore: false,
      syncedAt: 1_786_000_000,
    })

    const result = await syncStarredRepos(fetchPage)

    expect(fetchPage).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ total: 0, matched: 0 })
  })
})
