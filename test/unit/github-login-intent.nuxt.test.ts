import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  upsert: vi.fn(),
  replay: vi.fn(),
  scan: vi.fn(),
  email: vi.fn(),
  establish: vi.fn(),
  analytics: vi.fn(),
}))
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(), useSession: mocks.session }))
vi.mock('../../layers/identity/server/utils/users', () => ({ upsertUserFromGithub: mocks.upsert }))
vi.mock('../../layers/identity/server/utils/watch-actions', () => ({ handleWatchAction: mocks.replay }))
vi.mock('../../layers/identity/server/utils/scan-owned-repos', () => ({ scanOwnedRepos: mocks.scan, ownedRepoScanWarning: () => false }))
vi.mock('../../layers/identity/server/utils/github-emails', () => ({ fetchVerifiedPrimaryEmail: mocks.email }))

// Simulate GitHub's callback: it carries code and state, never our query fields.
describe('gitHub browser login round trip', () => {
  let handler: (event: H3Event) => Promise<unknown>
  let query: Record<string, string>
  let intent: Record<string, unknown>
  let failure: boolean
  let providerFailure: boolean
  const clearIntent = vi.fn(async () => {
    intent = {}
  })
  const event = { context: { platform: { env: { SKILLD_WEB_ANALYTICS: { writeDataPoint: mocks.analytics } } } } } as unknown as H3Event

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    query = {}
    intent = {}
    failure = false
    providerFailure = false
    mocks.upsert.mockResolvedValue({ id: 1, github_id: 1, login: 'octocat', onboarded_at: 1 })
    mocks.replay.mockResolvedValue(undefined)
    vi.stubGlobal('getQuery', () => query)
    vi.stubGlobal('getCookie', () => undefined)
    vi.stubGlobal('deleteCookie', vi.fn())
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('setUserSession', mocks.establish)
    vi.stubGlobal('useRuntimeConfig', () => ({ session: { password: 'x'.repeat(32) } }))
    vi.stubGlobal('emitOperationalEvent', vi.fn())
    vi.stubGlobal('createWideEvent', vi.fn())
    vi.stubGlobal('sendRedirect', (_event: unknown, target: string) => target)
    mocks.session.mockImplementation(async () => ({
      get data() { return intent },
      update: async (data: Record<string, unknown>) => { intent = data },
      clear: clearIntent,
    }))
    vi.stubGlobal('defineOAuthGitHubEventHandler', (options: {
      onSuccess: (event: H3Event, result: unknown) => Promise<unknown>
      onError: (event: H3Event) => Promise<unknown>
    }) => async (event: H3Event) => {
      if (providerFailure)
        throw new Error('GitHub is unavailable')
      if (failure)
        return options.onError(event)
      if (!query.code)
        return 'https://github.com/login/oauth/authorize'
      return options.onSuccess(event, {
        user: { id: 1, login: 'octocat', email: 'octocat@example.com' },
        tokens: { access_token: 'github-token' },
      })
    })
    handler = (await import('../../layers/identity/server/routes/auth/github.get')).default as typeof handler
  })

  it('returns to the starting page and replays the pending like', async () => {
    query = { return_to: '/gh/nuxt/ui/motion?from=search#run', action: 'like-skill' }
    await handler(event)
    query = { code: 'github-code', state: 'valid-state' }
    expect(await handler(event)).toBe('/gh/nuxt/ui/motion?from=search#run')
    expect(mocks.replay).toHaveBeenCalledWith(event, 1, 'like-skill', '/gh/nuxt/ui/motion?from=search#run')
    expect(clearIntent).toHaveBeenCalled()
  })

  it('keeps the starting action when GitHub sign-in fails', async () => {
    query = { return_to: '/@octocat/tools', action: 'watch-collection' }
    await handler(event)
    query = { error: 'access_denied', state: 'valid-state' }
    failure = true
    const target = new URL(String(await handler(event)), 'https://skilld.dev')
    expect(target.pathname).toBe('/login')
    expect(target.searchParams.get('return_to')).toBe('/@octocat/tools')
    expect(target.searchParams.get('action')).toBe('watch-collection')
    expect(target.searchParams.get('error')).toBe('oauth')
    expect(mocks.replay).not.toHaveBeenCalled()
    expect(mocks.analytics.mock.calls.map(([point]) => point)).toEqual([
      { blobs: ['oauth', '', 'signup', 'watch-collection', '', 'started', ''], doubles: [0, 0, 1], indexes: ['signup:oauth'] },
      { blobs: ['oauth', '', 'signup', 'watch-collection', '', 'failed', ''], doubles: [0, 0, 1], indexes: ['signup:oauth'] },
    ])
  })

  it('returns a retry link when the provider request throws', async () => {
    query = { return_to: '/skills', action: 'like-skill' }
    await handler(event)
    query = { code: 'github-code', state: 'valid-state' }
    providerFailure = true
    const target = new URL(String(await handler(event)), 'https://skilld.dev')
    expect(target.searchParams.get('return_to')).toBe('/skills')
    expect(target.searchParams.get('error')).toBe('oauth')
  })

  it('preserves the CLI authorization challenge through GitHub', async () => {
    query = { return_to: '/cli/authorize?challenge=challenge-value&port=8080' }
    await handler(event)
    query = { code: 'github-code', state: 'valid-state' }
    expect(await handler(event)).toBe('/cli/authorize?challenge=challenge-value&port=8080')
    expect(mocks.replay).not.toHaveBeenCalled()
  })

  it('keeps failed action replay retryable before establishing identity', async () => {
    query = { return_to: '/gh/nuxt/ui/motion', action: 'like-skill' }
    await handler(event)
    query = { code: 'github-code', state: 'valid-state' }
    mocks.replay.mockRejectedValue(new Error('Database is unavailable'))
    const target = new URL(String(await handler(event)), 'https://skilld.dev')
    expect(target.searchParams.get('return_to')).toBe('/gh/nuxt/ui/motion')
    expect(target.searchParams.get('action')).toBe('like-skill')
    expect(mocks.establish).not.toHaveBeenCalled()
  })

  it('rejects an external destination and does not reuse an old intent', async () => {
    query = { return_to: '/gh/nuxt/ui/motion', action: 'like-skill' }
    await handler(event)
    query = { return_to: '//evil.example', action: 'unknown-action' }
    await handler(event)
    query = { code: 'github-code', state: 'valid-state' }
    expect(await handler(event)).toBe('/me')
    expect(mocks.replay).not.toHaveBeenCalled()
  })
})
