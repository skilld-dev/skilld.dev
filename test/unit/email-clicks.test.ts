import type { H3Event } from 'h3'
import type { WeeklyRenderInput } from '../../layers/identity/server/utils/weekly-template'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import weeklyReport from '../../layers/admin/server/api/admin/weekly.get'
import clickHandler from '../../layers/identity/server/api/e/[campaign].get'
import { renderDigest } from '../../layers/identity/server/utils/digest-template'
import { parseEmailClick, parseSiteRelativePath, recordEmailClick } from '../../layers/identity/server/utils/email-clicks'
import { renderWeekly } from '../../layers/identity/server/utils/weekly-template'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

vi.hoisted(() => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
})

const ISSUE = 1_787_500_000

describe('email click destination', () => {
  it.each([
    '/skills/trending',
    '/',
    '/me/likes?tab=recent#top',
  ])('accepts the site path %s', (to) => {
    expect(parseSiteRelativePath(to)).toEqual({ _tag: 'ok', path: to })
  })

  // Each of these reads as "a path" to a naive check and resolves off-site,
  // or smuggles a header break into Location.
  it.each([
    ['//evil.test/phish', 'not-site-relative'],
    ['/\\evil.test', 'not-site-relative'],
    ['\\\\evil.test', 'not-site-relative'],
    ['/skills\\..\\..\\evil', 'not-site-relative'],
    ['/\t/evil.test', 'not-site-relative'],
    ['/\n/evil.test', 'not-site-relative'],
    ['/skills\r\nLocation: https://evil.test', 'not-site-relative'],
    ['https://evil.test/phish', 'not-site-relative'],
    ['javascript:alert(1)', 'not-site-relative'],
    ['evil.test', 'not-site-relative'],
    ['', 'missing-path'],
    [undefined, 'missing-path'],
    [['/skills', '//evil.test'], 'missing-path'],
    [`/${'a'.repeat(600)}`, 'path-too-long'],
  ])('rejects %j', (to, reason) => {
    expect(parseSiteRelativePath(to)).toEqual({ _tag: 'invalid', reason })
  })
})

describe('parsing an email click', () => {
  it('counts a well formed link by its path without the query', () => {
    expect(parseEmailClick('digest', { to: '/me/likes?tab=recent', p: 'overflow', i: String(ISSUE) })).toEqual({
      _tag: 'counted',
      to: '/me/likes?tab=recent',
      key: { campaign: 'digest', issue: ISSUE, placement: 'overflow', path: '/me/likes' },
    })
  })

  it('refuses an open redirect even when every other field is valid', () => {
    expect(parseEmailClick('weekly', { to: '//evil.test', p: 'cta', i: String(ISSUE) }))
      .toEqual({ _tag: 'invalid', reason: 'not-site-relative' })
  })

  it.each([
    ['newsletter', { p: 'cta', i: String(ISSUE) }, 'bad-campaign'],
    ['weekly', { p: 'made-up', i: String(ISSUE) }, 'bad-placement'],
    ['weekly', { p: 'cta', i: 'nope' }, 'bad-issue'],
    ['weekly', { p: 'cta', i: '-5' }, 'bad-issue'],
  ])('still lands a safe link it cannot count (%s)', (campaign, query, reason) => {
    expect(parseEmailClick(campaign, { to: '/skills', ...query })).toEqual({ _tag: 'uncounted', to: '/skills', reason })
  })

  it('lands links from sends before counting returned without counting them', () => {
    expect(parseEmailClick('weekly', { p: '/skills', k: 'cta', w: '1787000000', u: '2' }))
      .toEqual({ _tag: 'uncounted', to: '/skills', reason: 'legacy-link' })
    expect(parseEmailClick('weekly', { p: '//evil.test', k: 'cta', w: '1787000000', u: '2' }))
      .toEqual({ _tag: 'invalid', reason: 'not-site-relative' })
  })
})

describe('email click counter', () => {
  let d1: SqliteD1

  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
  })

  // Globals stay stubbed: the setup file's wide event stubs must survive.
  afterEach(() => {
    d1.close()
  })

  function rows() {
    return d1.raw.prepare('SELECT * FROM email_click_counts ORDER BY day, path').all()
  }

  it('adds to one row per day and link, and stores nothing else', async () => {
    const key = { campaign: 'digest', issue: ISSUE, placement: 'overflow', path: '/me/likes' } as const
    const monday = new Date('2026-09-14T23:59:00Z')

    await recordEmailClick(d1.db, key, monday)
    await recordEmailClick(d1.db, key, monday)
    await recordEmailClick(d1.db, key, new Date('2026-09-15T00:01:00Z'))
    await recordEmailClick(d1.db, { ...key, path: '/' }, monday)

    expect(rows()).toEqual([
      { day: '2026-09-14', campaign: 'digest', issue: ISSUE, placement: 'overflow', path: '/', clicks: 1 },
      { day: '2026-09-14', campaign: 'digest', issue: ISSUE, placement: 'overflow', path: '/me/likes', clicks: 2 },
      { day: '2026-09-15', campaign: 'digest', issue: ISSUE, placement: 'overflow', path: '/me/likes', clicks: 1 },
    ])
  })

  async function serve(campaign: string, query: Record<string, string>) {
    const headers = new Map<string, string>()
    const event = {
      method: 'GET',
      path: `/api/e/${campaign}?${new URLSearchParams(query)}`,
      context: { platform: { db: d1.db }, params: { campaign } },
      node: {
        req: { headers: {}, url: `/api/e/${campaign}?${new URLSearchParams(query)}` },
        res: {
          statusCode: 200,
          setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
          getHeader: (name: string) => headers.get(name.toLowerCase()),
          end: () => {},
        },
      },
      handled: false,
    } as unknown as H3Event
    vi.stubGlobal('getUserSession', () => Promise.resolve(null))
    await clickHandler(event)
    return {
      status: (event.node.res as { statusCode: number }).statusCode,
      location: headers.get('location') ?? '',
      cacheControl: headers.get('cache-control') ?? '',
    }
  }

  it('redirects a counted link to its path and counts it for the admin report', async () => {
    d1.raw.exec(`
      DELETE FROM users;
      INSERT INTO users (id, github_id, login, email, created_at, last_login_at) VALUES (1, 1, 'reader', 'r@example.com', 1, 1);
      INSERT INTO weekly_runs (user_id, window_start, window_end, status, provider_status, claimed_at, sent_at)
      VALUES (1, ${ISSUE - 604_800}, ${ISSUE}, 'sent', 'accepted', ${ISSUE}, ${ISSUE});
    `)
    vi.stubGlobal('requireAdmin', async () => ({ email: 'admin@example.com' }))

    const redirect = await serve('weekly', { to: '/skills/trending', p: 'cta', i: String(ISSUE) })
    await serve('weekly', { to: '/skills/trending', p: 'cta', i: String(ISSUE) })
    await serve('weekly', { to: '/api/share/weekly', p: 'share', i: String(ISSUE) })

    expect(redirect).toMatchObject({ status: 302, location: '/skills/trending', cacheControl: 'private, no-store' })
    const report = await weeklyReport({ context: { platform: { db: d1.db } }, node: { req: { headers: {} } } } as unknown as H3Event)
    expect(report.windows[0]).toMatchObject({ windowEnd: ISSUE, accepted: 1, clicks: 2, clicksPerAccepted: 2, shareClicks: 1 })
  })

  it('lands an open redirect attempt on home and counts nothing', async () => {
    const redirect = await serve('weekly', { to: '//evil.test/phish', p: 'cta', i: String(ISSUE) })

    expect(redirect).toMatchObject({ status: 302, location: '/' })
    expect(rows()).toEqual([])
  })
})

describe('counted email links', () => {
  function hrefs(html: string): string[] {
    return [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]!.replaceAll('&amp;', '&'))
  }

  function counted(html: string): URL[] {
    return hrefs(html).map(href => new URL(href)).filter(url => url.pathname.startsWith('/api/e/'))
  }

  function weekly(overrides: Partial<WeeklyRenderInput>): WeeklyRenderInput {
    return {
      edition: 'weekly',
      windowStart: ISSUE - 604_800,
      windowEnd: ISSUE,
      likedChanges: [],
      likedOverflow: 0,
      trackedCount: 0,
      trending: [{
        owner: 'antfu',
        repo: 'skills',
        slug: 'vitest',
        canonicalName: 'vitest',
        description: null,
        stars: 1,
        sourceUrl: 'https://github.com/antfu/skills/blob/sha/SKILL.md',
        reason: { _tag: 'named', authorCount: 2, mentionCount: 3, latestAt: ISSUE },
        evidence: null,
      }],
      siteUrl: 'https://skilld.dev',
      unsubscribeUrl: 'https://skilld.dev/api/unsubscribe?t=token-a&list=weekly',
      settingsUrl: 'https://skilld.dev/me',
      countClicks: true,
      ...overrides,
    }
  }

  it('gives two recipients of one weekly issue identical counted links naming no reader', () => {
    const a = renderWeekly(weekly({ recipientName: 'Ada', login: 'ada' }))
    const b = renderWeekly(weekly({ recipientName: 'Bo', login: 'bo', unsubscribeUrl: 'https://skilld.dev/api/unsubscribe?t=token-b&list=weekly' }))

    const links = counted(a.html)
    expect(links.map(String)).toEqual(counted(b.html).map(String))
    expect(links.map(url => url.pathname)).toContain('/api/e/weekly')
    for (const url of links)
      expect([...url.searchParams.keys()].sort()).toEqual(['i', 'p', 'to'])
    expect(links.map(url => parseEmailClick('weekly', Object.fromEntries(url.searchParams))._tag)).not.toContain('invalid')
  })

  it('counts digest links under the digest campaign with no reader in them', () => {
    const digest = (login: string) => renderDigest({
      login,
      recipientName: login,
      countClicks: true,
      windowStart: ISSUE - 2_592_000,
      windowEnd: ISSUE,
      siteUrl: 'https://skilld.dev',
      unsubscribeUrl: `https://skilld.dev/api/unsubscribe?t=${login}&list=digest`,
      entries: [{
        owner: 'antfu',
        repo: 'skills',
        skillNames: ['a', 'b', 'c', 'd', 'e', 'f'],
        changeCount: 6,
        skills: ['a', 'b', 'c', 'd', 'e', 'f'].map(name => ({
          name,
          description: null,
          changeCount: 1,
          commitMessages: ['fix'],
          changedAt: ISSUE - 60,
          sourceUrl: `https://github.com/antfu/skills/blob/sha/${name}/SKILL.md`,
          changeUrl: 'https://github.com/antfu/skills/compare/a...b',
        })),
      }],
    })

    const links = counted(digest('ada').html)
    expect(links.length).toBeGreaterThan(0)
    expect(links.map(String)).toEqual(counted(digest('bo').html).map(String))
    expect(new Set(links.map(url => url.pathname))).toEqual(new Set(['/api/e/digest']))
    expect(links.map(url => url.searchParams.get('to'))).toContain('/me/likes')
  })

  it('leaves previews uncounted', () => {
    const preview = renderWeekly(weekly({ countClicks: undefined }))

    expect(counted(preview.html)).toEqual([])
    expect(hrefs(preview.html)).toContain('https://skilld.dev/skills/trending')
  })
})
