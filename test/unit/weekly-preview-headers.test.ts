import type { EventHandler } from 'h3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), send: vi.fn(), admin: vi.fn() }))
vi.mock('../../shared/server/session-access', () => ({ readUserSession: mocks.session }))
vi.mock('../../layers/identity/server/utils/email', () => ({
  signUnsubToken: async () => 'token+/=',
  sendEmailWithEnv: mocks.send,
}))
vi.mock('../../layers/identity/server/utils/weekly-select', () => ({ loadWeeklyTrending: async () => [] }))
vi.mock('#app/nuxt', async importOriginal => ({
  ...await importOriginal<typeof import('#app/nuxt')>(),
  useRuntimeConfig: () => ({ publicSiteUrl: 'https://skilld.dev', tokenKey: 'test-key', email: { from: 'noreply@mail.skilld.dev' } }),
}))

async function request(to?: string) {
  vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
  vi.stubGlobal('readBody', async () => ({ login: 'operator', to }))
  vi.stubGlobal('requireAdmin', mocks.admin)
  const first = vi.fn().mockResolvedValue({ id: 7, login: 'operator', name: null, email: 'account@example.com', digest_email: null })
  const db = { prepare: () => ({ bind: () => ({ first }) }) }
  const handler = (await import('../../layers/admin/server/api/admin/weekly-preview.post')).default
  return handler({ method: 'POST', node: { req: { headers: {} } }, context: { platform: { db, env: {} } } } as unknown as Parameters<typeof handler>[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockResolvedValue({ user: { id: 7, login: 'operator' } })
  mocks.send.mockResolvedValue({ _tag: 'accepted', messageId: 'provider-id' })
})
afterEach(() => vi.unstubAllGlobals())

it('sends weekly previews only to the explicit address with one-click unsubscribe headers', async () => {
  await request('test@example.com')
  expect(mocks.send).toHaveBeenCalledWith({}, expect.objectContaining({
    to: 'test@example.com',
    subject: expect.stringMatching(/^\[test\] /),
    text: expect.stringContaining('https://skilld.dev/api/unsubscribe?t=token%2B%2F%3D&list=weekly'),
    headers: {
      'List-Unsubscribe': '<https://skilld.dev/api/unsubscribe?t=token%2B%2F%3D&list=weekly>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }))
})

it('renders without sending when no destination is supplied', async () => {
  await expect(request()).resolves.toMatchObject({ _tag: 'rendered' })
  expect(mocks.send).not.toHaveBeenCalled()
})

it('does not send when admin authorization fails', async () => {
  const denied = new Error('Forbidden')
  mocks.admin.mockRejectedValueOnce(denied)
  await expect(request('test@example.com')).rejects.toBe(denied)
  expect(mocks.send).not.toHaveBeenCalled()
})
