// @vitest-environment node
import { createApp, eventHandler, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiRateLimitHandler } from '../../shared/server/api-rate-limit'

const guest = vi.fn()
const account = vi.fn()
const poll = vi.fn()
const resolveUser = vi.fn()
const RESOLUTION_ID = '0d6f6c2e-5b1a-4c3e-9f1d-2a7b8c9d0e1f'

function serve() {
  const app = createApp()
  app.use(eventHandler((event) => {
    event.context.platform = { requestId: 'request-test', env: { API_GUEST_RATE_LIMIT: { limit: guest }, API_ACCOUNT_RATE_LIMIT: { limit: account }, API_RESOLUTION_POLL_RATE_LIMIT: { limit: poll } } } as never
  }))
  app.use(createApiRateLimitHandler(resolveUser))
  app.use(eventHandler(() => ({ ok: true })))
  const handle = toWebHandler(app)
  return (path = '/api/v1/trending', headers: HeadersInit = {}, method = 'GET') => handle(new Request(`https://skilld.dev${path}`, { headers, method }))
}

describe('api rate limits', () => {
  beforeEach(() => {
    guest.mockReset().mockResolvedValue({ success: true })
    account.mockReset().mockResolvedValue({ success: true })
    poll.mockReset().mockResolvedValue({ success: true })
    resolveUser.mockReset().mockResolvedValue(null)
  })

  it('shares the guest allowance across operations and ignores forwarded IPs', async () => {
    const fetch = serve()
    await fetch('/api/v1/trending', { 'CF-Connecting-IP': '203.0.113.8', 'X-Forwarded-For': 'spoof-one' })
    await fetch('/api/v1/skills', { 'CF-Connecting-IP': '203.0.113.8', 'X-Forwarded-For': 'spoof-two' })
    expect(guest.mock.calls).toEqual([[{ key: 'guest:203.0.113.8' }], [{ key: 'guest:203.0.113.8' }]])
    expect(resolveUser).not.toHaveBeenCalled()
  })

  it('shares one account allowance across different valid tokens', async () => {
    resolveUser.mockResolvedValue({ id: 7, login: 'octo' })
    const fetch = serve()
    await fetch('/api/v1/trending', { Authorization: 'Bearer token-one' })
    await fetch('/api/v1/account', { Authorization: 'Bearer token-two' })
    expect(account.mock.calls).toEqual([[{ key: 'account:7' }], [{ key: 'account:7' }]])
    expect(guest).not.toHaveBeenCalled()
  })

  it('gives invalid credentials the guest allowance', async () => {
    await serve()('/api/v1/trending', { 'Authorization': 'Bearer invalid', 'CF-Connecting-IP': '203.0.113.9' })
    expect(guest).toHaveBeenCalledWith({ key: 'guest:203.0.113.9' })
    expect(account).not.toHaveBeenCalled()
  })

  it('recognises a signed-in session', async () => {
    resolveUser.mockResolvedValue({ id: 9, login: 'octo' })
    await serve()('/api/v1/account', { Cookie: 'nuxt-session=valid' })
    expect(account).toHaveBeenCalledWith({ key: 'account:9' })
  })

  it('answers a non-cacheable contract problem when the allowance is spent', async () => {
    guest.mockResolvedValue({ success: false })
    const response = await serve()('/api/v1/trending', { 'CF-Connecting-IP': '203.0.113.8' })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED', status: 429, instance: '/api/v1/trending' })
  })

  it('keeps successful responses out of shared edge caching so every request is counted', async () => {
    const response = await serve()()
    expect(response.status).toBe(200)
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
  })

  it('leaves site and internal API traffic alone', async () => {
    const fetch = serve()
    await fetch('/developers')
    await fetch('/api/feed/trending')
    await fetch('/api/v1/trending', {}, 'OPTIONS')
    expect(guest).not.toHaveBeenCalled()
    expect(account).not.toHaveBeenCalled()
  })

  it('uses one conservative guest bucket when Cloudflare IP metadata is missing', async () => {
    await serve()('/api/v1/trending', { 'X-Forwarded-For': 'spoof' })
    expect(guest).toHaveBeenCalledWith({ key: 'guest:unknown' })
  })

  it('limits authenticated requests after their shared allowance is spent', async () => {
    resolveUser.mockResolvedValue({ id: 7, login: 'octo' })
    account.mockResolvedValue({ success: false })
    const response = await serve()('/api/v1/account', { Authorization: 'Bearer valid' })
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' })
    expect(guest).not.toHaveBeenCalled()
  })

  // A run polls its Resolution once a second while it builds. Sixty polls used
  // to spend the whole guest allowance, so one slow build failed the run with
  // RATE_LIMITED, and so did a second run from the same network.
  it('counts Resolution polls against their own allowance, not the shared one', async () => {
    const fetch = serve()
    for (let attempt = 0; attempt < 3; attempt++)
      await fetch(`/api/v1/resolutions/${RESOLUTION_ID}`, { 'CF-Connecting-IP': '203.0.113.8' })
    expect(poll.mock.calls).toEqual(Array.from({ length: 3 }, () => [{ key: 'guest:203.0.113.8' }]))
    expect(guest).not.toHaveBeenCalled()
  })

  it('keys an account poll by the account', async () => {
    resolveUser.mockResolvedValue({ id: 7, login: 'octo' })
    await serve()(`/api/v1/resolutions/${RESOLUTION_ID}`, { Authorization: 'Bearer valid' })
    expect(poll).toHaveBeenCalledWith({ key: 'account:7' })
    expect(account).not.toHaveBeenCalled()
  })

  it('still counts the request that starts a Resolution against the shared allowance', async () => {
    await serve()('/api/v1/resolutions', { 'CF-Connecting-IP': '203.0.113.8' }, 'POST')
    expect(guest).toHaveBeenCalledWith({ key: 'guest:203.0.113.8' })
    expect(poll).not.toHaveBeenCalled()
  })

  it('limits polls once their own allowance is spent', async () => {
    poll.mockResolvedValue({ success: false })
    const response = await serve()(`/api/v1/resolutions/${RESOLUTION_ID}`, { 'CF-Connecting-IP': '203.0.113.8' })
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' })
  })
})
