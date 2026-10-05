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
  INDEXNOW_MAX_RETRY_AFTER_SECONDS,
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

  function harness(options: {
    skills: Array<[string, string]>
    status?: number
    keyBody?: string
    retryAfter?: string
    respond?: (body: { urlList: string[] }) => { status: number, body?: string } | Error
  }) {
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
        const payload = JSON.parse(init.body as string)
        sent.push(payload)
        const custom = options.respond?.(payload)
        if (custom instanceof Error)
          throw custom
        if (custom)
          return new Response(custom.body ?? '', { status: custom.status })
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

  describe('every attempt is counted before it is sent', () => {
    function ledgerTotal(h: ReturnType<typeof harness>): number {
      return (h.sqlite.raw.prepare('SELECT COALESCE(SUM(url_count), 0) AS n FROM indexnow_batches').get() as { n: number }).n
    }

    it('counts a batch and halts when D1 fails after IndexNow accepted it, hour after hour', async () => {
      const skills = Array.from({ length: 500 }, (_, index) => [`/s/${index}`, 'v1'] as [string, string])
      const h = harness({ skills })
      // The first D1 write after each POST fails once, so the accept is never recorded.
      let armed = false
      const realDb = h.deps.db
      const flaky = new Proxy(realDb, {
        get(target, key) {
          if (key === 'batch') {
            return async (statements: never[]) => {
              if (armed) {
                armed = false
                throw new Error('D1 is unavailable')
              }
              return target.batch(statements)
            }
          }
          const value = Reflect.get(target, key)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      const send = h.deps.send
      const deps = {
        ...h.deps,
        db: flaky,
        send: (async (...args: Parameters<typeof fetch>) => {
          const response = await send(...args)
          armed = true
          return response
        }) as typeof fetch,
      }
      for (let hour = 0; hour < 24; hour++) {
        // The armed D1 failure makes each run reject on purpose; only the ledger matters.
        await runIndexNow(deps).catch(() => undefined) // eslint-disable-line harlanzw/no-silent-catch
        h.advance(3600)
      }
      expect(h.sent.length).toBeLessThanOrEqual(3)
      expect(ledgerTotal(h)).toBe(h.sent.length * INDEXNOW_RUN_CAP)
      const state = h.sqlite.raw.prepare('SELECT strikes, halt_reason FROM indexnow_state').get() as { strikes: number, halt_reason: string | null }
      expect(state.strikes).toBe(3)
      expect(state.halt_reason).toContain('halted')
    })

    it('treats a thrown send as a strike and halts after three', async () => {
      const h = harness({ skills: [['/a', 'v1']], respond: () => new Error('connect ECONNRESET') })
      const runs = []
      for (let hour = 0; hour < 24; hour++) {
        runs.push(await runIndexNow(h.deps))
        h.advance(3600)
      }
      expect(h.sent).toHaveLength(3)
      expect(runs[0]).toMatchObject({ _tag: 'failed', outcome: { _tag: 'error' } })
      expect(runs[2]).toMatchObject({ _tag: 'failed', state: { strikes: 3 } })
      expect(runs[2]!._tag === 'failed' && runs[2]!.state.haltReason).toContain('connect ECONNRESET')
      expect(runs[5]!._tag).toBe('closed')
      expect(ledgerTotal(h)).toBe(3)
    })

    it('records a failed attempt in the ledger', async () => {
      const h = harness({ skills: [['/a', 'v1'], ['/b', 'v1']], status: 503 })
      await runIndexNow(h.deps)
      expect(ledgerTotal(h)).toBe(2)
      expect(h.sqlite.raw.prepare('SELECT http_status FROM indexnow_batches').get()).toEqual({ http_status: 503 })
    })

    it('records an accepted batch with its status and clears the strikes', async () => {
      const h = harness({ skills: [['/a', 'v1']] })
      await runIndexNow(h.deps)
      expect(h.sqlite.raw.prepare('SELECT http_status FROM indexnow_batches').get()).toEqual({ http_status: 200 })
      expect(h.sqlite.raw.prepare('SELECT strikes FROM indexnow_state').get()).toEqual({ strikes: 0 })
    })
  })

  describe('a rejected request', () => {
    it('keeps a truncated response body in the halt reason', async () => {
      const body = `key invalid ${'x'.repeat(2000)}`
      const h = harness({ skills: [['/a', 'v1']], respond: () => ({ status: 403, body }) })
      const run = await runIndexNow(h.deps)
      const reason = run._tag === 'failed' ? run.state.haltReason ?? '' : ''
      expect(reason).toContain('HTTP 403')
      expect(reason).toContain('key invalid')
      expect(reason.length).toBeLessThan(400)
    })

    it('isolates one bad URL so the rest of the queue still goes out', async () => {
      const skills = Array.from({ length: 9 }, (_, index) => [`/s/${index}`, 'v1'] as [string, string])
      const h = harness({
        skills,
        respond: ({ urlList }) => urlList.includes('https://skilld.dev/s/4')
          ? { status: 422, body: 'invalid url https://skilld.dev/s/4' }
          : { status: 200 },
      })
      const tags: string[] = []
      for (let hour = 0; hour < 12; hour++) {
        tags.push((await runIndexNow(h.deps))._tag)
        h.advance(3600)
      }
      expect(tags).toContain('skipped')
      expect(tags.at(-1)).toBe('idle')
      const stored = h.sqlite.raw.prepare('SELECT url FROM indexnow_urls').all().map(row => (row as { url: string }).url)
      expect(stored).toHaveLength(9)
      const state = h.sqlite.raw.prepare('SELECT strikes, halt_reason FROM indexnow_state').get()
      expect(state).toMatchObject({ halt_reason: null })
      // The bad URL is sent alone once, never again.
      expect(h.sent.filter(payload => payload.urlList.length === 1 && payload.urlList[0]!.endsWith('/s/4'))).toHaveLength(1)
    })

    it('narrows the next request after a 400 instead of repeating it', async () => {
      const skills = Array.from({ length: 40 }, (_, index) => [`/s/${index}`, 'v1'] as [string, string])
      const h = harness({ skills, respond: ({ urlList }) => urlList.length > 10 ? { status: 400, body: 'bad' } : { status: 200 } })
      await runIndexNow(h.deps)
      h.advance(3600)
      await runIndexNow(h.deps)
      expect(h.sent.map(payload => payload.urlList.length)).toEqual([40, 20])
    })

    it('halts when every URL is rejected, without an endless split', async () => {
      const skills = Array.from({ length: 40 }, (_, index) => [`/s/${index}`, 'v1'] as [string, string])
      const h = harness({ skills, respond: () => ({ status: 400, body: 'bad' }) })
      const tags: string[] = []
      for (let hour = 0; hour < 24; hour++) {
        tags.push((await runIndexNow(h.deps))._tag)
        h.advance(3600)
      }
      expect(h.sent.length).toBeLessThanOrEqual(10)
      expect(tags.slice(-3)).toEqual(['closed', 'closed', 'closed'])
    })
  })

  describe('retry-After', () => {
    const DAY = 24 * 60 * 60

    it('honours a Retry-After longer than a day on a backoff', async () => {
      const h = harness({ skills: [['/a', 'v1']], status: 429, retryAfter: String(3 * DAY) })
      await runIndexNow(h.deps)
      expect(h.sqlite.raw.prepare('SELECT not_before FROM indexnow_state').get()).toEqual({ not_before: NOW + 3 * DAY })
    })

    it('caps Retry-After at the sane maximum', async () => {
      const h = harness({ skills: [['/a', 'v1']], status: 429, retryAfter: String(90 * DAY) })
      await runIndexNow(h.deps)
      expect(h.sqlite.raw.prepare('SELECT not_before FROM indexnow_state').get()).toEqual({ not_before: NOW + INDEXNOW_MAX_RETRY_AFTER_SECONDS })
      expect(INDEXNOW_MAX_RETRY_AFTER_SECONDS).toBe(7 * DAY)
    })

    it('makes a halt last as long as Retry-After and says so', () => {
      let state = INDEXNOW_INITIAL_STATE
      const outcome = { _tag: 'backoff', status: 429, retryAfterSeconds: 3 * DAY, detail: '' } as const
      for (let index = 0; index < 3; index++)
        state = applyOutcome(state, outcome, NOW)
      expect(state.notBefore).toBe(NOW + 3 * DAY)
      expect(state.haltReason).toContain('Retry-After')
    })
  })
})
