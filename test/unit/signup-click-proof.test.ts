import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeSignupClickProof, issueSignupClickProof } from '../../layers/identity/server/utils/signup-click-proof'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const sessions = vi.hoisted(() => new Map<string, { data: Record<string, unknown> }>())
vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => ({ session: { password: 'test-password' } }) }))
vi.mock('h3', async original => ({
  ...await original<typeof import('h3')>(),
  useSession: async (event: H3Event, options: { name: string }) => {
    expect(options.name).toBe('skilld-signup-click')
    const client = String(event.node.req.headers['cf-connecting-ip'])
    const session = sessions.get(client) ?? { data: {} }
    sessions.set(client, session)
    return {
      data: session.data,
      update: async (data: Record<string, unknown>) => {
        session.data = data
      },
    }
  },
}))

let d1: ReturnType<typeof createSqliteD1>
const limit = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-12T00:00:00Z'))
  d1 = createSqliteD1(allMigrations())
  sessions.clear()
  limit.mockReset().mockResolvedValue({ success: true })
})
afterEach(() => {
  d1.close()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function event(headers: Record<string, string> = {}): H3Event {
  return {
    node: {
      req: { headers: { 'host': 'skilld.dev', 'referer': 'https://skilld.dev/login?action=like-skill', 'cf-connecting-ip': '192.0.2.1', ...headers }, connection: { encrypted: true } },
      res: { setHeader() {} },
    },
    path: '/api/events/signup-proof',
    context: { platform: { db: d1.db, env: { API_GUEST_RATE_LIMIT: { limit } } } },
  } as unknown as H3Event
}

describe('anonymous click proof', () => {
  it('allows one same-page click and rejects replay of the sealed cookie', async () => {
    const nonce = await issueSignupClickProof(event())
    expect(nonce).toBeTruthy()
    await expect(consumeSignupClickProof(event({ 'x-signup-proof': nonce! }))).resolves.toBe(true)
    await expect(consumeSignupClickProof(event({ 'x-signup-proof': nonce! }))).resolves.toBe(false)
  })

  it.each([
    { 'x-signup-proof': 'forged' },
    { referer: 'https://skilld.dev/skills' },
    { referer: 'https://other.example/login' },
    { origin: 'https://other.example' },
    { 'cf-connecting-ip': '192.0.2.2' },
  ])('refuses a mismatched proof without consuming the valid nonce: %j', async (headers) => {
    const nonce = await issueSignupClickProof(event())
    await expect(consumeSignupClickProof(event({ 'x-signup-proof': nonce!, ...headers }))).resolves.toBe(false)
    await expect(consumeSignupClickProof(event({ 'x-signup-proof': nonce! }))).resolves.toBe(true)
  })

  it('expires the proof after five minutes', async () => {
    const nonce = await issueSignupClickProof(event())
    vi.advanceTimersByTime(300_000)
    await expect(consumeSignupClickProof(event({ 'x-signup-proof': nonce! }))).resolves.toBe(false)
  })

  it('accepts only one of two simultaneous requests using the same proof', async () => {
    const nonce = await issueSignupClickProof(event())
    const outcomes = await Promise.all([
      consumeSignupClickProof(event({ 'x-signup-proof': nonce! })),
      consumeSignupClickProof(event({ 'x-signup-proof': nonce! })),
    ])
    expect(outcomes.filter(Boolean)).toHaveLength(1)
  })

  it('throttles issuance and clicks using the Cloudflare client identity', async () => {
    limit.mockResolvedValueOnce({ success: false })
    await expect(issueSignupClickProof(event())).resolves.toBeNull()
    const nonce = await issueSignupClickProof(event())
    limit.mockResolvedValueOnce({ success: false })
    await expect(consumeSignupClickProof(event({ 'x-signup-proof': nonce! }))).resolves.toBe(false)
    expect(limit).toHaveBeenLastCalledWith({ key: 'signup-click:192.0.2.1' })
  })

  it('removes expired nonce rows when preparing the next page', async () => {
    const old = await issueSignupClickProof(event())
    vi.advanceTimersByTime(300_000)
    const nonce = await issueSignupClickProof(event())
    expect(d1.raw.prepare('SELECT nonce FROM signup_click_proofs').all()).toEqual([{ nonce }])
    expect(nonce).not.toBe(old)
  })
})
