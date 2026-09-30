import { describe, expect, it } from 'vitest'
import {
  applyOutcome,
  chunkUrls,
  classifyResponse,
  curatedSitemapUrls,
  gateFor,
  INDEXNOW_DAY_CAP,
  INDEXNOW_INITIAL_STATE,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  INDEXNOW_MAX_URLS_PER_REQUEST,
  INDEXNOW_RUN_CAP,
  parseRetryAfter,
  parseSitemapCandidates,
  planSubmission,
  runIndexNow,
  submissionBudget,
} from '../../server/utils/indexnow'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_800_000_000

function candidate(path: string, fingerprint = '2026-09-01T00:00:00Z') {
  return { url: `https://skilld.dev${path}`, fingerprint }
}

describe('sitemap parsing', () => {
  it('keeps only the curated child sitemaps of the index', () => {
    const index = `<sitemapindex>
      <sitemap><loc>https://skilld.dev/__sitemap__/pages.xml</loc></sitemap>
      <sitemap><loc>https://skilld.dev/__sitemap__/authors.xml</loc></sitemap>
      <sitemap><loc>https://skilld.dev/__sitemap__/sources.xml</loc></sitemap>
      <sitemap><loc>https://skilld.dev/__sitemap__/tags.xml</loc></sitemap>
      <sitemap><loc>https://skilld.dev/__sitemap__/skills-0.xml</loc></sitemap>
      <sitemap><loc>https://elsewhere.dev/__sitemap__/skills-1.xml</loc></sitemap>
    </sitemapindex>`
    expect(curatedSitemapUrls(index)).toEqual([
      'https://skilld.dev/__sitemap__/pages.xml',
      'https://skilld.dev/__sitemap__/authors.xml',
      'https://skilld.dev/__sitemap__/sources.xml',
      'https://skilld.dev/__sitemap__/skills-0.xml',
    ])
  })

  it('reads loc and lastmod, decodes entities, and drops other hosts', () => {
    const xml = `<urlset>
      <url><loc>https://skilld.dev/gh/a/b/c?x=1&amp;y=2</loc><lastmod>2026-09-01T00:00:00Z</lastmod></url>
      <url><loc>https://skilld.dev/skills/best</loc></url>
      <url><loc>https://www.skilld.dev/skills/other</loc></url>
    </urlset>`
    expect(parseSitemapCandidates(xml)).toEqual([
      { url: 'https://skilld.dev/gh/a/b/c?x=1&y=2', fingerprint: '2026-09-01T00:00:00Z' },
      { url: 'https://skilld.dev/skills/best', fingerprint: '' },
    ])
  })
})

describe('planSubmission', () => {
  it('selects new URLs and changed URLs, and skips unchanged ones', () => {
    const accepted = new Map([
      ['https://skilld.dev/same', 'v1'],
      ['https://skilld.dev/moved', 'v1'],
    ])
    const plan = planSubmission([
      candidate('/same', 'v1'),
      candidate('/moved', 'v2'),
      candidate('/new', 'v1'),
    ], accepted, 10)
    expect(plan.selected.map(item => item.url)).toEqual(['https://skilld.dev/new', 'https://skilld.dev/moved'])
    expect(plan.deferred).toBe(0)
  })

  it('never treats a URL with no fingerprint as changed', () => {
    const plan = planSubmission([candidate('/a', '')], new Map([['https://skilld.dev/a', 'v1']]), 10)
    expect(plan.selected).toEqual([])
  })

  it('caps a bulk change at the budget and reports the rest as deferred', () => {
    const many = Array.from({ length: 5000 }, (_, index) => candidate(`/p/${index}`))
    const plan = planSubmission(many, new Map(), INDEXNOW_RUN_CAP)
    expect(plan.selected).toHaveLength(INDEXNOW_RUN_CAP)
    expect(plan.deferred).toBe(5000 - INDEXNOW_RUN_CAP)
  })

  it('counts a URL listed twice once', () => {
    const plan = planSubmission([candidate('/a'), candidate('/a')], new Map(), 10)
    expect(plan.selected).toHaveLength(1)
  })
})

describe('submissionBudget', () => {
  it('shrinks as the day fills and never goes negative', () => {
    expect(submissionBudget({ runCap: 200, dayCap: 1000, submittedLastDay: 0 })).toBe(200)
    expect(submissionBudget({ runCap: 200, dayCap: 1000, submittedLastDay: 900 })).toBe(100)
    expect(submissionBudget({ runCap: 200, dayCap: 1000, submittedLastDay: 1200 })).toBe(0)
  })

  it('keeps one run under the protocol limit', () => {
    expect(INDEXNOW_RUN_CAP).toBeLessThanOrEqual(INDEXNOW_MAX_URLS_PER_REQUEST)
    expect(INDEXNOW_DAY_CAP).toBeGreaterThanOrEqual(INDEXNOW_RUN_CAP)
  })
})

describe('chunkUrls', () => {
  it('splits a list into requests of at most 10,000', () => {
    const chunks = chunkUrls(Array.from({ length: 25_001 }, (_, index) => index))
    expect(chunks.map(chunk => chunk.length)).toEqual([10_000, 10_000, 5001])
  })
})

describe('response handling', () => {
  it('reads Retry-After as seconds or as a date', () => {
    expect(parseRetryAfter('120', NOW)).toBe(120)
    expect(parseRetryAfter(new Date((NOW + 90) * 1000).toUTCString(), NOW)).toBe(90)
    expect(parseRetryAfter('soon', NOW)).toBeNull()
    expect(parseRetryAfter(null, NOW)).toBeNull()
  })

  it('classifies statuses', () => {
    expect(classifyResponse(200, null, NOW)._tag).toBe('accepted')
    expect(classifyResponse(202, null, NOW)._tag).toBe('accepted')
    expect(classifyResponse(429, '30', NOW)).toEqual({ _tag: 'backoff', status: 429, retryAfterSeconds: 30 })
    expect(classifyResponse(503, null, NOW)._tag).toBe('backoff')
    expect(classifyResponse(403, null, NOW)._tag).toBe('rejected')
    expect(classifyResponse(422, null, NOW)._tag).toBe('rejected')
  })
})

describe('applyOutcome', () => {
  const backoff = (retryAfterSeconds: number | null) => ({ _tag: 'backoff', status: 429, retryAfterSeconds }) as const

  it('stores the larger of the stored schedule and Retry-After', () => {
    const first = applyOutcome(INDEXNOW_INITIAL_STATE, backoff(60), NOW)
    expect(first).toEqual({ strikes: 1, notBefore: NOW + 15 * 60, haltReason: null })
    const second = applyOutcome(first, backoff(2 * 60 * 60), NOW)
    expect(second.notBefore).toBe(NOW + 2 * 60 * 60)
  })

  it('halts with a reason after repeated 429s, then re-halts on one more', () => {
    let state = INDEXNOW_INITIAL_STATE
    for (let index = 0; index < 3; index++)
      state = applyOutcome(state, backoff(null), NOW)
    expect(state.haltReason).toContain('HTTP 429 on 3 requests in a row')
    expect(state.notBefore).toBe(NOW + 24 * 60 * 60)
    const afterHalt = applyOutcome(state, backoff(null), NOW + 24 * 60 * 60)
    expect(afterHalt.haltReason).not.toBeNull()
  })

  it('halts at once on a rejected request', () => {
    const state = applyOutcome(INDEXNOW_INITIAL_STATE, { _tag: 'rejected', status: 403, detail: 'bad key' }, NOW)
    expect(state.haltReason).toContain('bad key')
    expect(gateFor(state, NOW + 60)._tag).toBe('closed')
  })

  it('clears the state on success', () => {
    const halted = applyOutcome(INDEXNOW_INITIAL_STATE, { _tag: 'rejected', status: 403, detail: 'x' }, NOW)
    expect(applyOutcome(halted, { _tag: 'accepted', status: 200 }, NOW + 1)).toEqual(INDEXNOW_INITIAL_STATE)
  })

  it('opens the gate once notBefore passes', () => {
    const state = applyOutcome(INDEXNOW_INITIAL_STATE, backoff(null), NOW)
    expect(gateFor(state, NOW + 10)._tag).toBe('closed')
    expect(gateFor(state, NOW + 15 * 60)._tag).toBe('open')
  })
})

describe('runIndexNow', () => {
  const INDEX = `<sitemapindex>
    <sitemap><loc>https://skilld.dev/__sitemap__/skills-0.xml</loc></sitemap>
    <sitemap><loc>https://skilld.dev/__sitemap__/tags.xml</loc></sitemap>
  </sitemapindex>`

  function urlset(entries: Array<[string, string]>): string {
    return `<urlset>${entries.map(([path, lastmod]) => `<url><loc>https://skilld.dev${path}</loc><lastmod>${lastmod}</lastmod></url>`).join('')}</urlset>`
  }

  function harness(options: { skills: Array<[string, string]>, status?: number, keyBody?: string, retryAfter?: string }) {
    const sqlite = createSqliteD1(allMigrations())
    const sent: Array<{ urlList: string[], key: string, keyLocation: string }> = []
    const fetched: string[] = []
    let clock = NOW
    const deps = {
      db: sqlite.db,
      now: () => clock,
      selfFetch: async (url: string) => {
        fetched.push(url)
        if (url.endsWith('/sitemap_index.xml'))
          return new Response(INDEX)
        if (url.endsWith('/skills-0.xml'))
          return new Response(urlset(options.skills))
        if (url === INDEXNOW_KEY_LOCATION)
          return new Response(options.keyBody ?? INDEXNOW_KEY, { status: options.keyBody === '' ? 404 : 200 })
        return new Response('unexpected', { status: 500 })
      },
      send: (async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(init.body as string))
        return new Response('', {
          status: options.status ?? 200,
          headers: options.retryAfter ? { 'retry-after': options.retryAfter } : {},
        })
      }) as unknown as typeof fetch,
    }
    return { sqlite, sent, fetched, deps, advance: (seconds: number) => {
      clock += seconds
    } }
  }

  it('submits new URLs once, then only what changed', async () => {
    const h = harness({ skills: [['/a', 'v1'], ['/b', 'v1']] })
    const first = await runIndexNow(h.deps)
    expect(first).toEqual({ _tag: 'submitted', submitted: 2, deferred: 0 })
    expect(h.sent[0]).toMatchObject({ key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_LOCATION })
    expect(h.sent[0]!.urlList).toEqual(['https://skilld.dev/a', 'https://skilld.dev/b'])

    h.advance(3600)
    expect(await runIndexNow(h.deps)).toEqual({ _tag: 'idle', candidates: 2 })
    expect(h.sent).toHaveLength(1)

    const changed = harness({ skills: [['/a', 'v1'], ['/b', 'v2']] })
    changed.sqlite.raw.exec(`INSERT INTO indexnow_urls VALUES ('https://skilld.dev/a', 'v1', 1), ('https://skilld.dev/b', 'v1', 1)`)
    expect(await runIndexNow(changed.deps)).toEqual({ _tag: 'submitted', submitted: 1, deferred: 0 })
    expect(changed.sent[0]!.urlList).toEqual(['https://skilld.dev/b'])
  })

  it('reads only the curated sitemaps, never the tags sitemap', async () => {
    const h = harness({ skills: [['/a', 'v1']] })
    await runIndexNow(h.deps)
    expect(h.fetched.some(url => url.includes('tags.xml'))).toBe(false)
  })

  it('submits at most one run cap when everything is new', async () => {
    const skills = Array.from({ length: 1500 }, (_, index) => [`/s/${index}`, 'v1'] as [string, string])
    const h = harness({ skills })
    const run = await runIndexNow(h.deps)
    expect(run).toEqual({ _tag: 'submitted', submitted: INDEXNOW_RUN_CAP, deferred: 1500 - INDEXNOW_RUN_CAP })
    expect(h.sent[0]!.urlList).toHaveLength(INDEXNOW_RUN_CAP)
  })

  it('stops for the day once the daily cap is spent', async () => {
    const skills = Array.from({ length: 3000 }, (_, index) => [`/s/${index}`, 'v1'] as [string, string])
    const h = harness({ skills })
    let total = 0
    for (let index = 0; index < 30; index++) {
      const run = await runIndexNow(h.deps)
      if (run._tag === 'submitted')
        total += run.submitted
      h.advance(3600 / 2)
    }
    // 30 runs over 15 hours: never more than the daily cap inside 24 hours.
    expect(total).toBeLessThanOrEqual(INDEXNOW_DAY_CAP)
    expect((await runIndexNow(h.deps))._tag).toBe('over-budget')
  })

  it('stores a retry time on 429 and sends nothing until it passes', async () => {
    const h = harness({ skills: [['/a', 'v1']], status: 429, retryAfter: '7200' })
    const first = await runIndexNow(h.deps)
    expect(first._tag).toBe('failed')
    const state = h.sqlite.raw.prepare('SELECT strikes, not_before FROM indexnow_state').get() as { strikes: number, not_before: number }
    expect(state).toEqual({ strikes: 1, not_before: NOW + 7200 })
    expect(h.sqlite.raw.prepare('SELECT COUNT(*) AS n FROM indexnow_urls').get()).toEqual({ n: 0 })

    h.advance(600)
    const second = await runIndexNow(h.deps)
    expect(second._tag).toBe('closed')
    expect(h.sent).toHaveLength(1)
  })

  it('halts with a logged reason after repeated 429s', async () => {
    const h = harness({ skills: [['/a', 'v1']], status: 429 })
    let last = await runIndexNow(h.deps)
    for (let index = 0; index < 2; index++) {
      h.advance(24 * 60 * 60)
      last = await runIndexNow(h.deps)
    }
    expect(last).toMatchObject({ _tag: 'failed', state: { strikes: 3 } })
    expect(last._tag === 'failed' && last.state.haltReason).toContain('halted for 24 hours')
    h.advance(60)
    expect(await runIndexNow(h.deps)).toMatchObject({ _tag: 'closed', reason: expect.stringContaining('halted') })
  })

  it('submits nothing while the key file is missing', async () => {
    const h = harness({ skills: [['/a', 'v1']], keyBody: '' })
    expect(await runIndexNow(h.deps)).toMatchObject({ _tag: 'key-unreachable' })
    expect(h.sent).toHaveLength(0)
  })

  it('submits nothing when the key file holds another key', async () => {
    const h = harness({ skills: [['/a', 'v1']], keyBody: 'not-the-key' })
    expect(await runIndexNow(h.deps)).toMatchObject({ _tag: 'key-unreachable' })
  })
})
