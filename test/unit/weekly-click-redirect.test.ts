import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('gET /api/e/weekly', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('getUserSession', () => Promise.resolve(null))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('302s a delivered tracked link to its site-relative path and records nothing', async () => {
    const prepare = vi.fn()
    const redirect = await serve(prepare, { p: '/skills', k: 'cta', w: '1787000000' })

    expect(redirect.status).toBe(302)
    expect(redirect.location).toBe('/skills')
    expect(redirect.cacheControl).toBe('private, no-store')
    expect(prepare).not.toHaveBeenCalled()
  })

  it('lands a protocol-relative target on home instead of another origin', async () => {
    const redirect = await serve(vi.fn(), { p: '//evil.test/skills', k: 'cta', w: '1787000000' })

    expect(redirect.status).toBe(302)
    expect(redirect.location).toBe('/')
  })

  async function serve(prepare: ReturnType<typeof vi.fn>, query: Record<string, string>) {
    const headers = new Map<string, string>()
    let redirected: { location: string, status: number } | undefined

    vi.stubGlobal('getQuery', () => query)
    vi.stubGlobal('setHeader', (_event: unknown, name: string, value: string) => {
      headers.set(name, value)
    })
    vi.stubGlobal('sendRedirect', (_event: unknown, location: string, status: number) => {
      redirected = { location, status }
      return Promise.resolve(undefined)
    })

    const { default: handler } = await import('../../layers/identity/server/api/e/weekly.get')
    const event = {
      method: 'GET',
      context: { platform: { db: { prepare } } },
      node: { req: { headers: {} } },
    } as unknown as H3Event

    await handler(event)

    return {
      status: redirected?.status ?? 0,
      location: redirected?.location ?? '',
      cacheControl: headers.get('cache-control') ?? '',
    }
  }
})
