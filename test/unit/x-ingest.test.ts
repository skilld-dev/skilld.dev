// @vitest-environment node
import type { XClient, XPage, XPost, XResult } from '../../shared/server/x-client'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { X_SEARCH_PAGE_SIZE, ZERO_METRICS } from '../../shared/server/x-client'
import { DAILY_DISCOVERY_READ_BUDGET, ingestXMentions, utcDayKey } from '../../shared/server/x-ingest'
import { createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0100_x_discovery_daily_budget.sql',
  'migrations/0101_discovery_ledger_size_guard.sql',
  'migrations/0103_bluesky_discovery.sql',
  // Widens `match_kind` to accept 'install', which an install-command
  // reference writes.
  'migrations/0105_install_match_kind.sql',
  // Adds `author_avatar`, which the ingest now stores.
  'migrations/0116_x_posts_author_avatar.sql',
]
const NOW = 1_760_000_000

function post(partial: Partial<XPost> = {}): XPost {
  return {
    id: '1001',
    text: 'great skill https://github.com/samber/cc-skills-golang',
    lang: 'en',
    postedAt: NOW - 3600,
    authorId: 'a1',
    authorHandle: 'someone',
    authorName: 'Some One',
    authorAvatar: 'https://pbs.twimg.com/profile_images/1/someone_normal.jpg',
    authorFollowers: 500,
    metrics: { ...ZERO_METRICS, favouriteCount: 20 },
    urls: ['https://github.com/samber/cc-skills-golang'],
    ...partial,
  }
}

function page(posts: XPost[], nextToken: string | null = null): XPage {
  return {
    posts,
    newestId: posts[0]?.id ?? null,
    nextToken,
    postsRead: posts.length,
  }
}

/** A client that replays a fixed list of pages, recording the cursor it saw. */
function stubClient(pages: Array<XResult<XPage>>) {
  const sinceIds: Array<string | null> = []
  const maxResults: Array<number | undefined> = []
  let call = 0
  const client: XClient = {
    async searchRecent({ sinceId, maxResults: max }) {
      sinceIds.push(sinceId)
      maxResults.push(max)
      return pages[call++] ?? { _tag: 'ok', value: page([]) }
    },
    async lookupPosts() {
      throw new Error('lookupPosts is not part of discovery')
    },
    async usage() {
      throw new Error('usage is not part of discovery')
    },
  }
  return { client, sinceIds, maxResults, callCount: () => call }
}

let harness: SqliteD1 | null = null

function db() {
  harness ??= createSqliteD1(MIGRATIONS)
  return harness
}

afterEach(() => {
  harness?.close()
  harness = null
})

describe('ingestXMentions persistence', () => {
  it('stores a post, its repo reference and an opening metrics snapshot', async () => {
    const { client } = stubClient([{ _tag: 'ok', value: page([post()]) }])
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.postsStored).toBe(1)
    expect(summary.reposSeen).toBe(1)

    const stored = db().raw.prepare('SELECT * FROM x_posts').all() as Array<Record<string, unknown>>
    expect(stored).toHaveLength(1)
    expect(stored[0]!.post_id).toBe('1001')
    expect(stored[0]!.favourite_count).toBe(20)
    expect(stored[0]!.author_avatar).toBe('https://pbs.twimg.com/profile_images/1/someone_normal.jpg')
    expect(stored[0]!.refresh_tier).toBe('hot')

    const links = db().raw.prepare('SELECT owner, repo, match_kind FROM x_post_repos').all()
    expect(links).toEqual([{ owner: 'samber', repo: 'cc-skills-golang', match_kind: 'link' }])

    const snapshots = db().raw.prepare('SELECT observed_at, favourite_count FROM x_post_metrics').all()
    expect(snapshots).toEqual([{ observed_at: NOW, favourite_count: 20 }])
  })

  it('records an unheard-of repo in the review ledger as pending', async () => {
    const { client } = stubClient([{ _tag: 'ok', value: page([post()]) }])
    await ingestXMentions({ db: db().db, client, now: NOW })

    const row = db().raw.prepare('SELECT source, owner, repo, status, mention_count, evidence_url FROM discovery_ledger').get() as Record<string, unknown>
    expect(row).toEqual({
      source: 'x',
      owner: 'samber',
      repo: 'cc-skills-golang',
      status: 'pending',
      mention_count: 1,
      evidence_url: 'https://x.com/someone/status/1001',
    })
  })

  it('announces a repo the ledger has never seen, and only that one', async () => {
    const seen: string[] = []
    const first = stubClient([{ _tag: 'ok', value: page([post()]) }])
    await ingestXMentions({
      db: db().db,
      client: first.client,
      now: NOW,
      onNewRepo: r => seen.push(`${r.owner}/${r.repo}`),
    })

    const second = stubClient([{ _tag: 'ok', value: page([post({ id: '1002', authorId: 'a2' })]) }])
    await ingestXMentions({
      db: db().db,
      client: second.client,
      now: NOW + 60,
      onNewRepo: r => seen.push(`${r.owner}/${r.repo}`),
    })

    expect(seen).toEqual(['samber/cc-skills-golang'])
  })

  it('counts repeat mentions and keeps the strongest evidence, not the latest', async () => {
    const strong = stubClient([{
      _tag: 'ok',
      value: page([post({ id: '1', metrics: { ...ZERO_METRICS, favouriteCount: 900 } })]),
    }])
    await ingestXMentions({ db: db().db, client: strong.client, now: NOW })

    const weak = stubClient([{
      _tag: 'ok',
      value: page([post({ id: '2', authorId: 'a2', metrics: { ...ZERO_METRICS, favouriteCount: 1 } })]),
    }])
    await ingestXMentions({ db: db().db, client: weak.client, now: NOW + 60 })

    const row = db().raw.prepare('SELECT mention_count, evidence_url FROM discovery_ledger').get() as Record<string, unknown>
    expect(row.mention_count).toBe(2)
    expect(row.evidence_url).toBe('https://x.com/someone/status/1')
  })

  it('links one post to every repo a thread names', async () => {
    const thread = post({
      text: 'three: github.com/a/one github.com/b/two github.com/c/three',
      urls: [],
    })
    const { client } = stubClient([{ _tag: 'ok', value: page([thread]) }])
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.reposSeen).toBe(3)
    const links = db().raw.prepare('SELECT repo FROM x_post_repos ORDER BY repo').all()
    expect(links).toEqual([{ repo: 'one' }, { repo: 'three' }, { repo: 'two' }])
  })

  it('splits a listicle post\'s evidence across the repos it names', async () => {
    // A live run had one "here are 20 repos" thread award every entry the same
    // 5,063, burying repos an author actually wrote about. Endorsement is now
    // divided, so a post about one repo outweighs a mention in a long list.
    const listicle = post({
      id: 'list',
      authorId: 'lister',
      metrics: { ...ZERO_METRICS, favouriteCount: 1000 },
      text: 'ten repos: github.com/a/one github.com/a/two github.com/a/three github.com/a/four github.com/a/five',
      urls: [],
    })
    const focused = post({
      id: 'focused',
      authorId: 'focuser',
      metrics: { ...ZERO_METRICS, favouriteCount: 300 },
      text: 'this one is great: github.com/b/single',
      urls: [],
    })

    const { client } = stubClient([{ _tag: 'ok', value: page([listicle, focused]) }])
    await ingestXMentions({ db: db().db, client, now: NOW })

    const rows = db().raw.prepare('SELECT owner, repo, evidence_score FROM discovery_ledger ORDER BY evidence_score DESC').all() as Array<{ owner: string, repo: string, evidence_score: number }>

    expect(rows[0]).toMatchObject({ owner: 'b', repo: 'single' })
    const listedEntry = rows.find(r => r.owner === 'a')!
    expect(listedEntry.evidence_score).toBeLessThan(rows[0]!.evidence_score)
  })

  it('stores a matching post that points at no repository', async () => {
    // We paid X for this read. Discarding it, which is what this used to do,
    // means buying it again to reconsider it later, and it destroys exactly
    // the viral prose posts the broadened query exists to catch.
    const chatter = post({ text: 'skills are overrated', urls: ['https://example.com/blog'] })
    const { client } = stubClient([{ _tag: 'ok', value: page([chatter]) }])
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.postsSkippedNoRepo).toBe(1)
    expect(summary.postsStored).toBe(1)
    expect(db().raw.prepare('SELECT COUNT(*) AS n FROM x_posts').get()).toEqual({ n: 1 })
    // No repo rows, so nothing reaches the review ledger from it.
    expect(db().raw.prepare('SELECT COUNT(*) AS n FROM x_post_repos').get()).toEqual({ n: 0 })
    expect(summary.reposSeen).toBe(0)
  })

  it('links a repository named only by an install command', async () => {
    // The 970-like post in the seeded corpus reads exactly like this and was
    // attached to no repository at all.
    const install = post({
      text: 'A few examples of using the Transitions skill in a real UI. npx skills add Jakubantalik/transitions.dev',
      urls: [],
    })
    const { client } = stubClient([{ _tag: 'ok', value: page([install]) }])
    await ingestXMentions({ db: db().db, client, now: NOW })

    expect(db().raw.prepare('SELECT owner, repo FROM x_post_repos').get())
      .toEqual({ owner: 'jakubantalik', repo: 'transitions.dev' })
  })

  it('does not put an infinite evidence score on a post with no repository', async () => {
    const chatter = post({ text: 'no links here', urls: [] })
    const { client } = stubClient([{ _tag: 'ok', value: page([chatter]) }])
    await ingestXMentions({ db: db().db, client, now: NOW })

    expect(db().raw.prepare('SELECT COUNT(*) AS n FROM discovery_ledger').get()).toEqual({ n: 0 })
  })

  it('re-ingesting a post updates engagement without resetting when it was found', async () => {
    const first = stubClient([{ _tag: 'ok', value: page([post()]) }])
    await ingestXMentions({ db: db().db, client: first.client, now: NOW })

    const second = stubClient([{
      _tag: 'ok',
      value: page([post({ metrics: { ...ZERO_METRICS, favouriteCount: 75 } })]),
    }])
    await ingestXMentions({ db: db().db, client: second.client, now: NOW + 3600 })

    const row = db().raw.prepare('SELECT first_seen_at, favourite_count FROM x_posts').get() as Record<string, unknown>
    expect(row.first_seen_at).toBe(NOW)
    expect(row.favourite_count).toBe(75)
  })
})

describe('ingestXMentions cursor', () => {
  it('starts with no cursor and advances to the newest post it saw', async () => {
    const { client, sinceIds } = stubClient([{ _tag: 'ok', value: page([post({ id: '5000' })]) }])
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(sinceIds).toEqual([null])
    expect(summary.cursorAdvancedTo).toBe('5000')

    const cursor = db().raw.prepare('SELECT since_id, posts_read_total FROM x_ingest_cursor').get() as Record<string, unknown>
    expect(cursor.since_id).toBe('5000')
    expect(cursor.posts_read_total).toBe(1)
  })

  it('passes the stored cursor on the next run, so no post is paid for twice', async () => {
    const first = stubClient([{ _tag: 'ok', value: page([post({ id: '5000' })]) }])
    await ingestXMentions({ db: db().db, client: first.client, now: NOW })

    const second = stubClient([{ _tag: 'ok', value: page([]) }])
    await ingestXMentions({ db: db().db, client: second.client, now: NOW + 900 })

    expect(second.sinceIds).toEqual(['5000'])
  })

  it('accumulates total posts read across runs, so cap spend is observable', async () => {
    const first = stubClient([{ _tag: 'ok', value: page([post({ id: '10' }), post({ id: '11', authorId: 'b' })]) }])
    await ingestXMentions({ db: db().db, client: first.client, now: NOW })

    const second = stubClient([{ _tag: 'ok', value: page([post({ id: '12', authorId: 'c' })]) }])
    await ingestXMentions({ db: db().db, client: second.client, now: NOW + 900 })

    const cursor = db().raw.prepare('SELECT posts_read_total FROM x_ingest_cursor').get()
    expect(cursor).toEqual({ posts_read_total: 3 })
  })

  it('keeps the cursor at the newest page when following pagination', async () => {
    const { client } = stubClient([
      { _tag: 'ok', value: page([post({ id: '900' })], 'token-2') },
      { _tag: 'ok', value: page([post({ id: '800', authorId: 'b' })]) },
    ])
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.pagesFetched).toBe(2)
    expect(summary.cursorAdvancedTo).toBe('900')
  })

  it('reports truncation rather than silently dropping the tail', async () => {
    const pages = Array.from({ length: 6 }, (_, i) => ({
      _tag: 'ok' as const,
      value: page([post({ id: String(9000 - i), authorId: `a${i}` })], `token-${i}`),
    }))
    const { client } = stubClient(pages)
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.truncated).toBe(true)
    expect(summary.pagesFetched).toBe(5)
  })
})

describe('ingestXMentions daily read budget', () => {
  /** One page of N posts, each charged. */
  function pageOf(n: number, idBase: number) {
    return {
      _tag: 'ok' as const,
      value: page(
        Array.from({ length: n }, (_, i) => post({ id: String(idBase + i), authorId: `a${i}` })),
        'more',
      ),
    }
  }

  it('never asks for more posts than the budget has left', async () => {
    // Bounded by whichever is smaller: X caps a page at 100, and the budget
    // now sits above that, so the page size governs the first request.
    const { client, maxResults } = stubClient([pageOf(1, 100)])
    await ingestXMentions({ db: db().db, client, now: NOW })
    expect(maxResults[0]).toBe(Math.min(X_SEARCH_PAGE_SIZE, DAILY_DISCOVERY_READ_BUDGET))
  })

  it('shrinks the last request to whatever budget remains', async () => {
    // The real guard: once most of the budget is gone, the next page must ask
    // only for the remainder, never a full 100 that would overspend.
    const spentAlready = DAILY_DISCOVERY_READ_BUDGET - 40
    db().raw.prepare(
      `INSERT INTO x_ingest_cursor (query_key, since_id, last_run_at, last_result_count, posts_read_total, budget_day, budget_spent)
       VALUES ('discovery-v1', NULL, ?, 0, 0, ?, ?)`,
    ).run(NOW, utcDayKey(NOW), spentAlready)

    const { client, maxResults } = stubClient([pageOf(1, 100)])
    await ingestXMentions({ db: db().db, client, now: NOW })
    expect(maxResults[0]).toBe(40)
  })

  it('stops paging once the budget is spent, and says so', async () => {
    const { client } = stubClient([
      pageOf(DAILY_DISCOVERY_READ_BUDGET, 100),
      pageOf(10, 500),
    ])
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.postsRead).toBe(DAILY_DISCOVERY_READ_BUDGET)
    expect(summary.budgetExhausted).toBe(true)
    expect(summary.pagesFetched).toBe(1)
  })

  it('carries spend across runs within the same UTC day', async () => {
    const first = stubClient([pageOf(DAILY_DISCOVERY_READ_BUDGET, 100)])
    await ingestXMentions({ db: db().db, client: first.client, now: NOW })

    const second = stubClient([pageOf(5, 900)])
    const summary = await ingestXMentions({ db: db().db, client: second.client, now: NOW + 60 })

    // The budget was already gone, so the second run must not send a request.
    expect(second.callCount()).toBe(0)
    expect(summary.budgetExhausted).toBe(true)
    expect(summary.postsRead).toBe(0)
  })

  it('resets the budget on the next UTC day', async () => {
    const first = stubClient([pageOf(DAILY_DISCOVERY_READ_BUDGET, 100)])
    await ingestXMentions({ db: db().db, client: first.client, now: NOW })

    const nextDay = NOW + 24 * 60 * 60
    const second = stubClient([pageOf(3, 900)])
    const summary = await ingestXMentions({ db: db().db, client: second.client, now: nextDay })

    expect(summary.postsRead).toBe(3)
    expect(summary.budgetSpentToday).toBe(3)
    expect(summary.budgetExhausted).toBe(false)
  })
})

describe('ingestXMentions failure handling', () => {
  it('keeps posts from earlier pages when a later page fails', async () => {
    const { client } = stubClient([
      { _tag: 'ok', value: page([post({ id: '900' })], 'token-2') },
      { _tag: 'err', error: { _tag: 'rate-limited', resetAt: NOW + 300 } },
    ])
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.error).toEqual({ _tag: 'rate-limited', resetAt: NOW + 300 })
    expect(summary.postsStored).toBe(1)
    expect(db().raw.prepare('SELECT COUNT(*) AS n FROM x_posts').get()).toEqual({ n: 1 })
  })

  it('surfaces a missing token instead of reporting a clean empty run', async () => {
    const { client } = stubClient([{ _tag: 'err', error: { _tag: 'not-configured' } }])
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.error).toEqual({ _tag: 'not-configured' })
    expect(summary.postsStored).toBe(0)
  })

  it('does not move the cursor forward when the first page failed', async () => {
    const first = stubClient([{ _tag: 'ok', value: page([post({ id: '5000' })]) }])
    await ingestXMentions({ db: db().db, client: first.client, now: NOW })

    const failing = stubClient([{ _tag: 'err', error: { _tag: 'cap-exceeded' } }])
    await ingestXMentions({ db: db().db, client: failing.client, now: NOW + 900 })

    const cursor = db().raw.prepare('SELECT since_id FROM x_ingest_cursor').get()
    expect(cursor).toEqual({ since_id: '5000' })
  })
})

describe('ingestXMentions cursor safety', () => {
  it('holds the cursor when the budget stops a run mid-window', async () => {
    // Advancing to the newest id here jumped past every post the run could not
    // afford, losing them permanently. Because the daily budget is spent by the
    // first run after UTC midnight, that discarded most of the stream daily.
    const pages = Array.from({ length: 6 }, (_, i) => ({
      _tag: 'ok' as const,
      value: page([post({ id: String(9000 - i), authorId: `a${i}` })], `token-${i}`),
    }))
    const { client } = stubClient(pages)
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.windowExhausted).toBe(false)
    expect(summary.cursorAdvancedTo).toBeNull()
    const cursor = db().raw.prepare('SELECT since_id FROM x_ingest_cursor').get()
    expect(cursor).toEqual({ since_id: null })
  })

  it('advances the cursor once the window is fully consumed', async () => {
    const { client } = stubClient([{ _tag: 'ok', value: page([post({ id: '5000' })]) }])
    const summary = await ingestXMentions({ db: db().db, client, now: NOW })

    expect(summary.windowExhausted).toBe(true)
    expect(summary.cursorAdvancedTo).toBe('5000')
  })

  it('keeps an established cursor rather than clearing it on a partial run', async () => {
    const first = stubClient([{ _tag: 'ok', value: page([post({ id: '5000' })]) }])
    await ingestXMentions({ db: db().db, client: first.client, now: NOW })

    const partial = stubClient(Array.from({ length: 6 }, (_, i) => ({
      _tag: 'ok' as const,
      value: page([post({ id: String(6000 - i), authorId: `b${i}` })], `t-${i}`),
    })))
    await ingestXMentions({ db: db().db, client: partial.client, now: NOW + 900 })

    // COALESCE keeps the old cursor; the next run resumes from the same point.
    expect(db().raw.prepare('SELECT since_id FROM x_ingest_cursor').get())
      .toEqual({ since_id: '5000' })
  })
})
