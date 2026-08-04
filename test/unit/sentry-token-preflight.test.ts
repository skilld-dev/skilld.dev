import { describe, expect, it } from 'vitest'
import {
  classifySentryTokenPreflight,
  SENTRY_ORG,
  SENTRY_PROJECT,
} from '../../scripts/tools/verify-sentry-token.mjs'

// A missing/rotated/wrong-org SENTRY_AUTH_TOKEN must fail the deploy loudly
// BEFORE the build. The sentry vite plugin treats upload failures as warnings
// and `sourcemaps.disable` gates on token presence, so without this preflight
// a bad secret ships green deploys with minified client stacks (the 2026-07-24
// incident).
describe('sentry token preflight', () => {
  it('pins the org and project the deploy uploads to', () => {
    expect(SENTRY_ORG).toBe('harlan-zw')
    expect(SENTRY_PROJECT).toBe('skilld')
  })

  it('accepts a token that can read the project', () => {
    expect(classifySentryTokenPreflight(200, '')).toEqual({ _tag: 'ok' })
  })

  it('rejects an expired or revoked token as fatal', () => {
    const result = classifySentryTokenPreflight(401, JSON.stringify({ detail: 'Invalid token' }))
    expect(result._tag).toBe('rejected')
    if (result._tag !== 'rejected')
      return
    expect(result.diagnostic).toContain('rejected')
    expect(result.diagnostic).toContain('harlan-zw/skilld')
  })

  it('explains the wrong-org token failure mode on 403/404', () => {
    for (const status of [403, 404]) {
      const result = classifySentryTokenPreflight(status, JSON.stringify({ detail: 'The requested resource does not exist' }))
      expect(result._tag).toBe('rejected')
      if (result._tag !== 'rejected')
        continue
      // Org-scoped tokens embed their org and override the configured one, so
      // the diagnostic must point at token/org mismatch, not at our config.
      expect(result.diagnostic).toContain('created under another Sentry org')
      expect(result.diagnostic).toContain('The requested resource does not exist')
    }
  })

  it('treats any other status as fatal instead of silently passing', () => {
    const result = classifySentryTokenPreflight(500, 'edge html')
    expect(result._tag).toBe('rejected')
    if (result._tag !== 'rejected')
      return
    expect(result.diagnostic).toContain('500')
  })

  it('never echoes response bodies that are not known-safe JSON details', () => {
    const result = classifySentryTokenPreflight(502, '<html>noisy edge failure</html>')
    expect(result._tag).toBe('rejected')
    if (result._tag !== 'rejected')
      return
    expect(result.diagnostic).not.toContain('<html>')
  })
})
