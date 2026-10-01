import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRepo } from '../../layers/registry/server/utils/github-client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRepo with a timeout', () => {
  it('aborts a hung GitHub read instead of waiting for it', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    })))
    const started = Date.now()

    await expect(getRepo('skilld-dev', 'skills', {}, { timeoutMs: 20 })).rejects.toBeDefined()

    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('sets no signal when the caller passes no timeout', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await getRepo('skilld-dev', 'skills', {})

    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBeUndefined()
  })
})
