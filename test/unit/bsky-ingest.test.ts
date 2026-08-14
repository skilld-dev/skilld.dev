// @vitest-environment node
import type { BskyClient, BskyPage, BskyPost, BskyResult } from '../../shared/server/bsky-client'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ZERO_BSKY_METRICS } from '../../shared/server/bsky-client'
import { bskyPostUrl, ingestBskyMentions, LOOKBACK_DAYS } from '../../shared/server/bsky-ingest'
import { createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0100_x_discovery_daily_budget.sql',
  'migrations/0101_discovery_ledger_size_guard.sql',
  'migrations/0103_bluesky_discovery.sql',
]
const NOW = 1_760_000_000

let harness: SqliteD1 | null = null

function db() {
  harness ??= createSqliteD1(MIGRATIONS)
  return harness
}

afterEach(() => {
  harness?.close()
  harness = null
})

function post(partial: Partial<BskyPost> = {}): BskyPost {
  return {
    uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
    text: 'great skill https://github.com/kepano/obsidian-skills',
    lang: 'en',
    postedAt: NOW - 3600,
    authorDid: 'did:plc:abc',
    authorHandle: 'someone.bsky.social',
    authorName: 'Some One',
    metrics: { ...ZERO_BSKY_METRICS, likeCount: 20 },
    urls: ['https://github.com/kepano/obsidian-skills'],
    cardText: null,
    ...partial,
  }
}

/**
 * A client returning the same single page for every query.
 *
 * The ingest runs one request per discovery phrase, and the phrases overlap by
 * design, so this is also what exercises cross-query deduplication.
 */
function stubClient(posts: BskyPost[], overrides: Partial<{
  authenticated: boolean
  results: Array<BskyResult<BskyPage>>
}> = {}) {
  const queries: string[] = []
  const sinces: string[] = []
  let call = 0
  const client: BskyClient = {
    async searchPosts({ query, since }) {
      queries.push(query)
      sinces.push(since)
      const scripted = overrides.results?.[call++]
      if (scripted)
        return scripted
      return { _tag: 'ok', value: { posts, cursor: null, postsRead: posts.length } }
    },
    isAuthenticated: () => overrides.authenticated ?? false,
  }
  return { client, queries, sinces }
}

describe('ingestBskyMentions', () => {
  it('stores a post once however many queries matched it', async () => {
    const { client, queries } = stubClient([post()])

    const summary = await ingestBskyMentions({ db: db().db, client, now: NOW })

    expect(queries.length).toBeGreaterThan(1)
    expect(summary.postsUnique).toBe(1)
    expect(summary.postsStored).toBe(1)
    expect(db().raw.prepare(`SELECT COUNT(*) AS n FROM x_posts`).get()).toEqual({ n: 1 })
  })

  it('labels stored posts as bsky and freezes them against the X refresh task', async () => {
    const { client } = stubClient([post()])

    await ingestBskyMentions({ db: db().db, client, now: NOW })

    expect(db().raw.prepare(`SELECT platform, refresh_tier FROM x_posts`).get())
      .toEqual({ platform: 'bsky', refresh_tier: 'frozen' })
  })

  it('records the repo in the ledger under the bsky source', async () => {
    const { client } = stubClient([post()])

    const summary = await ingestBskyMentions({ db: db().db, client, now: NOW })

    expect(summary.ledgerInserted).toBe(1)
    expect(db().raw.prepare(`SELECT source, owner, repo FROM discovery_ledger`).get())
      .toEqual({ source: 'bsky', owner: 'kepano', repo: 'obsidian-skills' })
  })

  it('scores with Bluesky weights, so a like counts one and a repost three', async () => {
    const { client } = stubClient([post({
      metrics: { likeCount: 10, repostCount: 2, replyCount: 1, quoteCount: 0 },
    })])

    await ingestBskyMentions({ db: db().db, client, now: NOW })

    // 10 likes + 2 reposts x3 + 1 reply x2 = 18. Under X's weights the same
    // post would be scored against a bookmark count that does not exist here.
    expect(db().raw.prepare(`SELECT evidence_score FROM discovery_ledger`).get())
      .toEqual({ evidence_score: 18 })
  })

  it('splits a post score across every repo it names', async () => {
    const { client } = stubClient([post({
      text: 'https://github.com/a/one and https://github.com/b/two',
      urls: ['https://github.com/a/one', 'https://github.com/b/two'],
      metrics: { ...ZERO_BSKY_METRICS, likeCount: 10 },
    })])

    await ingestBskyMentions({ db: db().db, client, now: NOW })

    const rows = db().raw.prepare(`SELECT owner, evidence_score FROM discovery_ledger ORDER BY owner`).all()
    expect(rows).toEqual([
      { owner: 'a', evidence_score: 5 },
      { owner: 'b', evidence_score: 5 },
    ])
  })

  it('finds a repo named only in an embed card, not in the post text', async () => {
    const { client } = stubClient([post({
      text: 'this is great',
      urls: ['https://github.com/pixeline/atproto-oauth'],
      cardText: 'atproto-oauth\nOAuth for AT Protocol',
    })])

    const summary = await ingestBskyMentions({ db: db().db, client, now: NOW })

    expect(summary.postsStored).toBe(1)
    expect(db().raw.prepare(`SELECT owner, repo FROM discovery_ledger`).get())
      .toEqual({ owner: 'pixeline', repo: 'atproto-oauth' })
  })

  it('skips a matched post that names no repo', async () => {
    const { client } = stubClient([post({ text: 'skills are neat', urls: [], cardText: null })])

    const summary = await ingestBskyMentions({ db: db().db, client, now: NOW })

    expect(summary.postsStored).toBe(0)
    expect(summary.postsSkippedNoRepo).toBe(1)
    expect(db().raw.prepare(`SELECT COUNT(*) AS n FROM x_posts`).get()).toEqual({ n: 0 })
  })

  it('re-observes engagement for a post already stored', async () => {
    const first = stubClient([post({ metrics: { ...ZERO_BSKY_METRICS, likeCount: 5 } })])
    await ingestBskyMentions({ db: db().db, client: first.client, now: NOW })

    const second = stubClient([post({ metrics: { ...ZERO_BSKY_METRICS, likeCount: 40 } })])
    await ingestBskyMentions({ db: db().db, client: second.client, now: NOW + 7200 })

    expect(db().raw.prepare(`SELECT favourite_count FROM x_posts`).get())
      .toEqual({ favourite_count: 40 })
    // Both observations are kept, which is what makes velocity measurable
    // without any equivalent of the paid X refresh task.
    expect(db().raw.prepare(`SELECT COUNT(*) AS n FROM x_post_metrics`).get())
      .toEqual({ n: 2 })
  })

  it('keeps first_seen_at from the original sighting on re-ingest', async () => {
    const first = stubClient([post()])
    await ingestBskyMentions({ db: db().db, client: first.client, now: NOW })

    const second = stubClient([post()])
    await ingestBskyMentions({ db: db().db, client: second.client, now: NOW + 86_400 })

    expect(db().raw.prepare(`SELECT first_seen_at FROM x_posts`).get())
      .toEqual({ first_seen_at: NOW })
  })

  it('asks for a window that starts one lookback period ago', async () => {
    const { client, sinces } = stubClient([])

    await ingestBskyMentions({ db: db().db, client, now: NOW })

    expect(sinces[0]).toBe(new Date((NOW - LOOKBACK_DAYS * 86_400) * 1000).toISOString())
  })

  it('keeps the results of the queries that succeeded when one fails', async () => {
    const { client } = stubClient([post()], {
      results: [{ _tag: 'err', error: { _tag: 'throttled', retryAfter: null } }],
    })

    const summary = await ingestBskyMentions({ db: db().db, client, now: NOW })

    expect(summary.failedQueries).toHaveLength(1)
    expect(summary.postsStored).toBe(1)
  })

  it('reports every query failing without storing anything', async () => {
    const failure: BskyResult<BskyPage> = {
      _tag: 'err',
      error: { _tag: 'auth-failed', message: 'nope' },
    }
    const { client, queries } = stubClient([], {
      results: Array.from({ length: 20 }).fill(failure),
    })

    const summary = await ingestBskyMentions({ db: db().db, client, now: NOW })

    expect(summary.failedQueries).toHaveLength(queries.length)
    expect(summary.requestsMade).toBe(0)
    expect(summary.postsStored).toBe(0)
  })
})

describe('bskyPostUrl', () => {
  it('builds a permalink from the AT-URI, keyed by DID rather than handle', () => {
    expect(bskyPostUrl(post())).toBe('https://bsky.app/profile/did:plc:abc/post/xyz')
  })
})
