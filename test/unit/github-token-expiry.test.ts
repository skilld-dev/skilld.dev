import { describe, expect, it } from 'vitest'
import { parseTokenExpiry, tokenExpiryStatus } from '../../layers/registry/server/utils/github-token-expiry'

/**
 * The production GITHUB_TOKEN expired around 2026-07-23 and nothing noticed for
 * two days: every repo failed with a per-repo 401 and the operator email never
 * mentioned it. GitHub returns the expiry on every authenticated response, so
 * the deadline is knowable long before it lands.
 */
describe('parseTokenExpiry', () => {
  it('reads the expiry header GitHub sends on authenticated responses', () => {
    const headers = new Headers({ 'github-authentication-token-expiration': '2026-10-23 04:31:33 UTC' })
    expect(parseTokenExpiry(headers)?.toISOString()).toBe('2026-10-23T04:31:33.000Z')
  })

  it('accepts the ISO form some endpoints return', () => {
    const headers = new Headers({ 'github-authentication-token-expiration': '2026-10-23T04:31:33Z' })
    expect(parseTokenExpiry(headers)?.toISOString()).toBe('2026-10-23T04:31:33.000Z')
  })

  it('returns null for a non-expiring token or an unparseable value', () => {
    expect(parseTokenExpiry(new Headers())).toBeNull()
    expect(parseTokenExpiry(new Headers({ 'github-authentication-token-expiration': 'soon' }))).toBeNull()
  })
})

describe('tokenExpiryStatus', () => {
  const now = new Date('2026-07-26T00:00:00Z')

  it('is unknown when GitHub sent no expiry', () => {
    expect(tokenExpiryStatus(null, now)).toEqual({ _tag: 'unknown' })
  })

  it('is healthy while the deadline is comfortably away', () => {
    expect(tokenExpiryStatus(new Date('2026-10-23T04:31:33Z'), now)).toEqual({
      _tag: 'healthy',
      daysRemaining: 89,
    })
  })

  it('warns inside the renewal window so there is time to rotate', () => {
    expect(tokenExpiryStatus(new Date('2026-08-05T00:00:00Z'), now)).toEqual({
      _tag: 'expiring',
      daysRemaining: 10,
    })
  })

  it('treats an elapsed deadline as expired, which is what took sync down', () => {
    expect(tokenExpiryStatus(new Date('2026-07-23T00:00:00Z'), now)).toEqual({
      _tag: 'expired',
      daysRemaining: -3,
    })
  })
})
