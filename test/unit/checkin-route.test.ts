// @vitest-environment node
import { createApp, toWebHandler } from 'h3'
import { beforeEach, expect, it, vi } from 'vitest'
import handler from '../../layers/identity/server/api/internal/checkin.get'

const boundary = vi.hoisted(() => ({ config: { checkinToken: 'secret' }, env: undefined as any, run: vi.fn() }))
vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => boundary.config }))
vi.mock('@harlan-zw/nuxt-cloudflare/bindings', () => ({ resolveCloudflareBindings: () => boundary.env }))
vi.mock('../../layers/identity/server/utils/daily-health-check', () => ({ buildDailyHealthCheck: vi.fn(), frontDoorFetcher: vi.fn() }))
vi.mock('../../layers/identity/server/utils/daily-health-checkin', () => ({ runDailyHealthChecks: boundary.run }))
beforeEach(() => {
  boundary.config.checkinToken = 'secret'
  boundary.env = { DB: {}, CF_VERSION_METADATA: { id: 'worker-current' } }
  boundary.run.mockReset().mockResolvedValue({ identity: { deployment: 'worker-current' }, severity: 'pass' })
})
async function request(token?: string) {
  return toWebHandler(createApp().use(handler))(new Request('http://localhost/api/internal/checkin', { headers: token ? { authorization: `Bearer ${token}` } : {} }))
}
it.each([undefined, 'wrong'])('rejects unauthorized reads before collection', async (token) => {
  const response = await request(token)
  expect(response.status).toBe(401)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(boundary.run).not.toHaveBeenCalled()
})
it('rejects missing Worker identity before collection', async () => {
  boundary.env.CF_VERSION_METADATA = undefined
  expect((await request('secret')).status).toBe(503)
  expect(boundary.run).not.toHaveBeenCalled()
})
it('returns the current Worker report without caching', async () => {
  const response = await request('secret')
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toMatchObject({ identity: { deployment: 'worker-current' } })
  expect(boundary.run.mock.calls[0]?.[3]).toBe('worker-current')
})
