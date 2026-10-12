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

describe('bounded import results', () => {
  it('returns partial coverage instead of claiming a complete import', async () => {
    const fetchPage = vi.fn(async (_url: string, options: { body: { page: number } }) => ({
      ok: true as const,
      page: options.body.page,
      fetched: 100,
      total: options.body.page * 100,
      matched: 2,
      hasMore: options.body.page < 10,
      syncedAt: null,
    }))
    expect(await syncStarredRepos(fetchPage)).toMatchObject({ page: 10, total: 1000, syncedAt: null })
    expect(fetchPage).toHaveBeenCalledTimes(10)
  })
  it('carries the import generation into continuation requests', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ ok: true, page: 1, fetched: 100, total: 100, matched: 2, hasMore: true, syncedAt: null, importId: 'generation-one' })
      .mockResolvedValueOnce({ ok: true, page: 2, fetched: 1, total: 101, matched: 2, hasMore: false, syncedAt: 20, importId: 'generation-one' })
    await syncStarredRepos(fetchPage)
    expect(fetchPage).toHaveBeenLastCalledWith('/api/me/stars/sync', { method: 'POST', body: { page: 2, importId: 'generation-one' } })
  })
})
