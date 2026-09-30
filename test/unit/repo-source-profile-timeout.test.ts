import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

vi.stubGlobal('defineCachedEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'owner' ? 'skilld-dev' : 'skills'))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('defineCachedEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
  vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'owner' ? 'skilld-dev' : 'skills'))
})

async function profile() {
  const harness = createSqliteD1(allMigrations())
  const handler = (await import('../../layers/registry/server/api/repos/[owner]/[repo].get')).default as (event: H3Event) => Promise<Record<string, unknown>>
  return handler({ context: { platform: { db: harness.db, env: {} } } } as unknown as H3Event)
}

describe('repository source profile when GitHub hangs', () => {
  it('answers the unavailable profile with a timeout on the read', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    vi.stubGlobal('fetch', fetchMock)

    const body = await profile()

    expect(body).toMatchObject({ owner: 'skilld-dev', repo: 'skills', skillFileScanStatus: 'unavailable' })
  })
})
