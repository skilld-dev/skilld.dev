import { describe, expect, it } from 'vitest'
import {
  countObservabilityFailures,
  parseSentryIssuesResponse,
} from '../../scripts/tools/sentry-observability.mjs'

describe('sentry observability', () => {
  it('makes HTTP 403 visible and never interprets it as zero issues', () => {
    const result = parseSentryIssuesResponse(403, { detail: 'Forbidden' })
    expect(result).toMatchObject({
      _tag: 'missing_observability',
      status: 403,
    })
    expect(result.diagnostic).toContain('lacks issue-read permission')
    expect(countObservabilityFailures(result)).toBe(1)
    expect(result).not.toHaveProperty('newIssues')
  })

  it('names the token source so a scope failure is actionable', () => {
    const result = parseSentryIssuesResponse(403, { detail: 'Forbidden' }, '.env.sentry-build-plugin')
    expect(result.diagnostic).toContain('Token came from .env.sentry-build-plugin.')
    expect(parseSentryIssuesResponse(401, { detail: 'Unauthorized' }, '~/.sentryclirc').diagnostic)
      .toContain('Token came from ~/.sentryclirc.')
  })

  it('parses successful issue responses at the boundary', () => {
    expect(parseSentryIssuesResponse(200, [{
      id: '12345',
      shortId: 'SKILLD-1',
      title: 'Failure',
      culprit: '/skills',
      permalink: 'https://example.sentry.io/issues/12345/',
      count: '3',
      userCount: 2,
      firstSeen: '2026-07-23T00:00:00Z',
      lastSeen: '2026-07-23T01:00:00Z',
    }])).toEqual({
      _tag: 'available',
      newIssues: [{
        id: '12345',
        shortId: 'SKILLD-1',
        title: 'Failure',
        culprit: '/skills',
        permalink: 'https://example.sentry.io/issues/12345/',
        count: 3,
        userCount: 2,
        firstSeen: '2026-07-23T00:00:00Z',
        lastSeen: '2026-07-23T01:00:00Z',
      }],
      recurringIssues: [],
      truncatedAtLimit: false,
    })
  })

  /**
   * Production evidence (2026-08-06): the probe queried `firstSeen:>{since}`,
   * so 686 `D1_ERROR: D1 DB is overloaded` events that recurred on five already
   * known issue ids — after the deploy meant to fix them — reached the archive
   * as nothing at all, and the morning verdict was written AMBER on that
   * silence. An issue that fires again is a regression, not background noise.
   */
  const issue = (overrides = {}) => ({
    id: '7651521804',
    shortId: 'SKILLD-H',
    title: 'D1_ERROR: D1 DB is overloaded.',
    culprit: '/api/skill-related',
    permalink: 'https://harlan-zw.sentry.io/issues/7651521804/',
    count: 1410,
    userCount: 1,
    firstSeen: '2026-08-04T10:34:57Z',
    lastSeen: '2026-08-05T16:24:40Z',
    ...overrides,
  })

  it('separates an issue that recurred in the window from one born in it', () => {
    const result = parseSentryIssuesResponse(200, [
      issue(),
      issue({ id: '99', shortId: 'SKILLD-Z', firstSeen: '2026-08-05T09:00:00Z', lastSeen: '2026-08-05T09:30:00Z' }),
    ], null, '2026-08-05T01:39:08Z')

    expect(result._tag).toBe('available')
    expect(result.newIssues.map(i => i.shortId)).toEqual(['SKILLD-Z'])
    expect(result.recurringIssues.map(i => i.shortId)).toEqual(['SKILLD-H'])
    expect(result.recurringIssues[0]).toMatchObject({ count: 1410, lastSeen: '2026-08-05T16:24:40Z' })
  })

  it('treats every issue as new when the window start is unknown', () => {
    const result = parseSentryIssuesResponse(200, [issue()], null, null)

    expect(result.newIssues).toHaveLength(1)
    expect(result.recurringIssues).toEqual([])
  })

  it('reports truncation rather than implying the list was complete', () => {
    const many = Array.from({ length: 4 }, (_, i) => issue({ id: String(i), shortId: `SKILLD-${i}` }))

    expect(parseSentryIssuesResponse(200, many, null, null, 4).truncatedAtLimit).toBe(true)
    expect(parseSentryIssuesResponse(200, many, null, null, 5).truncatedAtLimit).toBe(false)
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
      id: '12345',
      shortId: 'SKILLD-1',
      title: 'Failure',
      culprit: '/skills',
      permalink: 'https://example.sentry.io/issues/12345/',
      count,
      userCount,
      firstSeen: '2026-07-23T00:00:00Z',
      lastSeen: '2026-07-23T01:00:00Z',
    }])).toMatchObject({ _tag: 'parse_failure' })
  })
})
