import type { EventHandler } from 'h3'

const mocks = vi.hoisted(() => ({ session: vi.fn(), write: vi.fn() }))
vi.mock('../../shared/server/session-access', () => ({ readUserSession: mocks.session }))

async function request(body: unknown, signedIn: boolean) {
  mocks.session.mockResolvedValue(signedIn ? { user: { id: 42, login: 'private-login' } } : null)
  vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
  vi.stubGlobal('createError', (input: { statusCode: number }) => Object.assign(new Error('rejected'), input))
  vi.stubGlobal('readBody', async () => body)
  const handler = (await import('../../layers/identity/server/api/events/signup.post')).default as unknown as (event: unknown) => Promise<unknown>
  return handler({
    method: 'POST',
    node: { req: { headers: {} } },
    context: { platform: { env: { SKILLD_WEB_ANALYTICS: { writeDataPoint: mocks.write } } } },
  })
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

it('writes only fixed event labels from an authenticated request', async () => {
  await expect(request({ stage: 'discover', entry: 'onboarding', outcome: 'viewed' }, true)).resolves.toEqual({ ok: true })
  expect(mocks.write).toHaveBeenCalledWith({ blobs: ['discover', '', 'signup', 'onboarding', '', 'viewed', ''], doubles: [0, 0, 1], indexes: ['signup:discover'] })
})

it('refuses counts from a signed-out request', async () => {
  await expect(request({ stage: 'discover', entry: 'onboarding', outcome: 'viewed' }, false)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.write).not.toHaveBeenCalled()
})

it('refuses an event carrying an account identifier', async () => {
  await expect(request({ stage: 'email', entry: 'onboarding', outcome: 'saved', choice: 'none', userId: 42 }, true)).rejects.toMatchObject({ statusCode: 400 })
  expect(mocks.write).not.toHaveBeenCalled()
})
