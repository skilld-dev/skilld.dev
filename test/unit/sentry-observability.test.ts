import { describe, expect, it } from 'vitest'
import {
  countObservabilityFailures,
  parseSentryIssuesResponse,
} from '../../scripts/tools/sentry-observability.mjs'

describe('sentry observability', () => {
  it('makes HTTP 403 visible and never interprets it as zero issues', () => {
    const result = parseSentryIssuesResponse(403, { detail: 'Forbidden' })
    expect(result).toEqual({
      _tag: 'missing_observability',
      status: 403,
      diagnostic: 'Sentry authorization failed with HTTP 403.',
    })
    expect(countObservabilityFailures(result)).toBe(1)
    expect(result).not.toHaveProperty('newIssues')
  })

  it('parses successful issue responses at the boundary', () => {
    expect(parseSentryIssuesResponse(200, [{
      shortId: 'SKILLD-1',
      title: 'Failure',
      count: '3',
      userCount: 2,
      firstSeen: '2026-07-23T00:00:00Z',
      lastSeen: '2026-07-23T01:00:00Z',
    }])).toEqual({
      _tag: 'available',
      newIssues: [{
        shortId: 'SKILLD-1',
        title: 'Failure',
        count: 3,
        userCount: 2,
        firstSeen: '2026-07-23T00:00:00Z',
        lastSeen: '2026-07-23T01:00:00Z',
      }],
    })
  })

  it('makes provider and parse failures explicit', () => {
    expect(parseSentryIssuesResponse(500, { detail: 'broken' }))
      .toMatchObject({ _tag: 'provider_failure', status: 500 })
    expect(parseSentryIssuesResponse(200, { unexpected: true }))
      .toMatchObject({ _tag: 'parse_failure' })
  })

  it.each([
    ['empty count', '', 2],
    ['negative count', -1, 2],
    ['fractional count', 1.5, 2],
    ['empty user count', 3, ''],
    ['negative user count', 3, '-1'],
    ['fractional user count', 3, '1.5'],
  ])('rejects %s', (_label, count, userCount) => {
    expect(parseSentryIssuesResponse(200, [{
      shortId: 'SKILLD-1',
      title: 'Failure',
      count,
      userCount,
      firstSeen: '2026-07-23T00:00:00Z',
      lastSeen: '2026-07-23T01:00:00Z',
    }])).toMatchObject({ _tag: 'parse_failure' })
  })
})
