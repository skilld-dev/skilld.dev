import { describe, expect, it } from 'vitest'
import {
  parseWeeklyClick,
  siteRelativePath,
  trackedUrl,
} from '../../layers/identity/server/utils/weekly-tracking'

const SITE = 'https://skilld.dev'
const context = { siteUrl: SITE, userId: 2, windowEnd: 1_787_000_000 }

describe('what counts as a site link', () => {
  it('accepts an absolute link to our own origin', () => {
    expect(siteRelativePath(`${SITE}/gh/nuxt/skills/deploy`, SITE)).toBe('/gh/nuxt/skills/deploy')
  })

  it('accepts an already-relative path', () => {
    expect(siteRelativePath('/skills/trending', SITE)).toBe('/skills/trending')
  })

  // The whole point of the redirect carrying a path rather than a URL. Each of
  // these parses as "a path" to a naive check and resolves somewhere else.
  it.each([
    '//evil.test/phish',
    'https://evil.test/phish',
    'https://skilld.dev.evil.test/phish',
    'http://skilld.dev/phish',
  ])('refuses %s', (url) => {
    expect(siteRelativePath(url, SITE)).toBeNull()
  })

  it('refuses an origin-prefixed protocol-relative path', () => {
    expect(siteRelativePath(`${SITE}//evil.test`, SITE)).toBeNull()
  })
})

describe('rewriting a link for tracking', () => {
  it('routes a site link through the endpoint', () => {
    const url = new URL(trackedUrl(context, `${SITE}/gh/nuxt/skills/deploy`, 'trending'))

    expect(url.origin).toBe(SITE)
    expect(url.pathname).toBe('/api/e/weekly')
    expect(url.searchParams.get('p')).toBe('/gh/nuxt/skills/deploy')
    expect(url.searchParams.get('k')).toBe('trending')
    expect(url.searchParams.get('u')).toBe('2')
    expect(url.searchParams.get('w')).toBe('1787000000')
  })

  // A bug in tracking should cost a measurement, never a broken email.
  it('leaves an off-site link untouched', () => {
    const x = 'https://x.com/dillon_mulroy/status/2087537790061850984'

    expect(trackedUrl(context, x, 'trending')).toBe(x)
  })

  it('omits the recipient when there is none', () => {
    const url = new URL(trackedUrl({ ...context, userId: null }, `${SITE}/skills`, 'cta'))

    expect(url.searchParams.has('u')).toBe(false)
  })
})

describe('parsing a click back', () => {
  it('accepts a well-formed click', () => {
    expect(parseWeeklyClick({ p: '/gh/a/b/c', k: 'liked', w: '1787000000', u: '2' }))
      .toEqual({ _tag: 'ok', path: '/gh/a/b/c', placement: 'liked', windowEnd: 1_787_000_000, userId: 2 })
  })

  it.each([
    ['//evil.test', 'not-site-relative'],
    ['https://evil.test', 'not-site-relative'],
    ['/\\evil.test', 'not-site-relative'],
    ['', 'missing-path'],
  ])('refuses %s', (p, reason) => {
    expect(parseWeeklyClick({ p, k: 'liked', w: '1', u: '2' })).toEqual({ _tag: 'invalid', reason })
  })

  it('refuses a placement it does not define', () => {
    expect(parseWeeklyClick({ p: '/x', k: 'made-up', w: '1' }))
      .toEqual({ _tag: 'invalid', reason: 'bad-placement' })
  })

  it('treats a junk recipient as anonymous rather than failing', () => {
    expect(parseWeeklyClick({ p: '/x', k: 'cta', w: 'nope', u: 'nope' }))
      .toMatchObject({ _tag: 'ok', windowEnd: 0, userId: null })
  })
})
