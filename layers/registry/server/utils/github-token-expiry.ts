/**
 * GitHub returns `github-authentication-token-expiration` on every
 * authenticated response. Reading it turns a credential expiry from an outage
 * discovered two days late into a deadline visible for weeks beforehand.
 */

const EXPIRING_WINDOW_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

export type TokenExpiryStatus
  = | { _tag: 'unknown' }
    | { _tag: 'healthy', daysRemaining: number }
    | { _tag: 'expiring', daysRemaining: number }
    | { _tag: 'expired', daysRemaining: number }

/**
 * GitHub sends `2026-10-23 04:31:33 UTC`, which `Date` does not accept, so the
 * space-separated form is normalised before parsing. Anything unrecognised
 * becomes null rather than an Invalid Date that silently compares false.
 */
export function parseTokenExpiry(headers: Headers): Date | null {
  const raw = headers.get('github-authentication-token-expiration')?.trim()
  if (!raw)
    return null
  const normalized = raw.replace(' UTC', 'Z').replace(' ', 'T')
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function tokenExpiryStatus(expiresAt: Date | null, now: Date): TokenExpiryStatus {
  if (!expiresAt)
    return { _tag: 'unknown' }
  const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / MS_PER_DAY)
  if (daysRemaining < 0)
    return { _tag: 'expired', daysRemaining }
  if (daysRemaining <= EXPIRING_WINDOW_DAYS)
    return { _tag: 'expiring', daysRemaining }
  return { _tag: 'healthy', daysRemaining }
}
