// @vitest-environment node
import type { XClient, XPost } from '../../shared/server/x-client'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ZERO_METRICS } from '../../shared/server/x-client'
import { refreshXEngagement } from '../../shared/server/x-refresh'
import { DEFAULT_REFRESH_POLICY } from '../../shared/x-refresh-policy'
import { createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0100_x_discovery_daily_budget.sql',
]
const NOW = 1_760_000_000
const HOUR = 3600

let harness: SqliteD1 | null = null

function db() {
  harness ??= createSqliteD1(MIGRATIONS)
  return harness
}

afterEach(() => {
  harness?.close()
  harness = null
})

/** Insert a tracked post directly, bypassing discovery. */
function seedPost(input: {
  id: string
  postedAt?: number
  favourites?: number
  tier?: 'hot' | 'warm' | 'frozen'
  nextRefreshAt?: number
  metricsUpdatedAt?: number
}) {
  db().raw.prepare(
    `INSERT INTO x_posts (
       post_id, author_id, author_handle, author_followers, text_extract, lang,
       posted_at, first_seen_at, favourite_count, repost_count, reply_count,
       quote_count, bookmark_count, impression_count, metrics_updated_at,
       refresh_tier, next_refresh_at
     ) VALUES (?, 'a1', 'someone', 100, 'text', 'en', ?, ?, ?, 0, 0, 0, 0, 0, ?, ?, ?)`,
  ).run(
    input.id,
    input.postedAt ?? NOW - HOUR,
    NOW - HOUR,
    input.favourites ?? 0,
    input.metricsUpdatedAt ?? NOW - HOUR,
    input.tier ?? 'hot',
    input.nextRefreshAt ?? NOW - 1,
  )
}

function freshPost(id: string, favourites: number, postedAt = NOW - HOUR): XPost {
  return {
    id,
    text: 'text',
    lang: 'en',
    postedAt,
    authorId: 'a1',
    authorHandle: 'someone',
    authorName: null,
    authorFollowers: 100,
    metrics: { ...ZERO_METRICS, favouriteCount: favourites },
    urls: [],
  }
}

function stubClient(posts: XPost[]) {
  const requested: string[][] = []
  const client: XClient = {
    async searchRecent() {
      throw new Error('searchRecent is not part of refresh')
    },
    async lookupPosts(ids) {
      requested.push(ids)
      const matched = posts.filter(p => ids.includes(p.id))
      return {
        _tag: 'ok',
        value: { posts: matched, newestId: null, nextToken: null, postsRead: matched.length },
      }
    },
    async usage() {
      throw new Error('usage is not part of refresh')
    },
  }
  return { client, requested }
}

describe('refreshXEngagement', () => {
  it('records a new snapshot and updates the denormalized counts', async () => {
    seedPost({ id: '1', favourites: 10 })
    const { client } = stubClient([freshPost('1', 60)])

    const summary = await refreshXEngagement({ db: db().db, client, now: NOW })
    expect(summary.refreshed).toBe(1)

    const row = db().raw.prepare('SELECT favourite_count, metrics_updated_at FROM x_posts').get()
    expect(row).toEqual({ favourite_count: 60, metrics_updated_at: NOW })

    const snapshots = db().raw.prepare('SELECT observed_at, favourite_count FROM x_post_metrics ORDER BY observed_at').all()
    expect(snapshots).toEqual([{ observed_at: NOW, favourite_count: 60 }])
  })

  it('leaves a post that is not yet due alone, spending nothing', async () => {
    seedPost({ id: '1', nextRefreshAt: NOW + HOUR })
    const { client, requested } = stubClient([freshPost('1', 999)])

    const summary = await refreshXEngagement({ db: db().db, client, now: NOW })
    expect(summary.claimed).toBe(0)
    expect(summary.postsRead).toBe(0)
    expect(requested).toEqual([])
  })

  it('never claims a frozen post, however overdue it looks', async () => {
    seedPost({ id: '1', tier: 'frozen', nextRefreshAt: NOW - 10 * HOUR })
    const { client } = stubClient([freshPost('1', 999)])

    const summary = await refreshXEngagement({ db: db().db, client, now: NOW })
    expect(summary.claimed).toBe(0)
  })

  it('freezes a post the API no longer returns, so it stops costing reads', async () => {
    seedPost({ id: 'deleted' })
    const { client } = stubClient([])

    const summary = await refreshXEngagement({ db: db().db, client, now: NOW })
    expect(summary.vanished).toBe(1)

    const row = db().raw.prepare('SELECT refresh_tier FROM x_posts').get()
    expect(row).toEqual({ refresh_tier: 'frozen' })
  })

  it('retires a post that aged out of the hot window without gaining traction', async () => {
    const old = NOW - (DEFAULT_REFRESH_POLICY.hotWindowHours + 1) * HOUR
    seedPost({ id: '1', postedAt: old, favourites: 1 })
    const { client } = stubClient([freshPost('1', 1, old)])

    const summary = await refreshXEngagement({ db: db().db, client, now: NOW })
    expect(summary.frozen).toBe(1)
    expect(db().raw.prepare('SELECT refresh_tier FROM x_posts').get())
      .toEqual({ refresh_tier: 'frozen' })
  })

  it('freezes a post past the window even while it is climbing hard', async () => {
    // The old policy kept such a post on a slow tier for a week. Under
    // per-UTC-day billing that tail was most of the bill, so age is now the
    // only thing that decides, and a late bloomer is a deliberate miss.
    const old = NOW - (DEFAULT_REFRESH_POLICY.hotWindowHours + 1) * HOUR
    seedPost({ id: '1', postedAt: old, favourites: 100, metricsUpdatedAt: NOW - HOUR })
    const { client } = stubClient([freshPost('1', 400, old)])

    const summary = await refreshXEngagement({ db: db().db, client, now: NOW })
    expect(summary.promotedToHot).toBe(0)
    expect(summary.frozen).toBe(1)
    expect(db().raw.prepare('SELECT refresh_tier FROM x_posts').get())
      .toEqual({ refresh_tier: 'frozen' })
  })

  it('honours the per-run read ceiling', async () => {
    for (let i = 0; i < 10; i++)
      seedPost({ id: `p${i}` })
    const { client, requested } = stubClient(
      Array.from({ length: 10 }, (_, i) => freshPost(`p${i}`, 5)),
    )

    const summary = await refreshXEngagement({ db: db().db, client, now: NOW, maxPostsPerRun: 3 })
    expect(summary.claimed).toBe(3)
    expect(requested.flat()).toHaveLength(3)
  })

  it('splits a large claim into batches the API will accept', async () => {
    for (let i = 0; i < 150; i++)
      seedPost({ id: `p${i}` })
    const { client, requested } = stubClient(
      Array.from({ length: 150 }, (_, i) => freshPost(`p${i}`, 5)),
    )

    await refreshXEngagement({ db: db().db, client, now: NOW })
    expect(requested.map(r => r.length)).toEqual([100, 50])
  })

  it('stops on an API failure and leaves the rest for the next run', async () => {
    for (let i = 0; i < 150; i++)
      seedPost({ id: `p${i}` })
    let call = 0
    const client: XClient = {
      async searchRecent() {
        throw new Error('not used')
      },
      async lookupPosts(ids) {
        if (call++ === 0) {
          return {
            _tag: 'ok',
            value: {
              posts: ids.map(id => freshPost(id, 5)),
              newestId: null,
              nextToken: null,
              postsRead: ids.length,
            },
          }
        }
        return { _tag: 'err', error: { _tag: 'cap-exceeded' } }
      },
      async usage() {
        throw new Error('not used')
      },
    }

    const summary = await refreshXEngagement({ db: db().db, client, now: NOW })
    expect(summary.error).toEqual({ _tag: 'cap-exceeded' })
    expect(summary.refreshed).toBe(100)

    // The untouched 50 keep their old due time, so nothing is read twice.
    const stillDue = db().raw.prepare(`SELECT COUNT(*) AS n FROM x_posts WHERE metrics_updated_at < ?`).get(NOW)
    expect(stillDue).toEqual({ n: 50 })
  })

  it('prunes stale snapshots but never a post\'s only one', async () => {
    seedPost({ id: 'active' })
    seedPost({ id: 'dormant', tier: 'frozen' })
    const ancient = NOW - 400 * 24 * HOUR
    for (const id of ['active', 'dormant']) {
      db().raw.prepare(
        `INSERT INTO x_post_metrics (post_id, observed_at, favourite_count, repost_count,
           reply_count, quote_count, bookmark_count, impression_count)
         VALUES (?, ?, 1, 0, 0, 0, 0, 0)`,
      ).run(id, ancient)
    }

    const { client } = stubClient([freshPost('active', 5)])
    const summary = await refreshXEngagement({ db: db().db, client, now: NOW })

    expect(summary.snapshotsPruned).toBe(1)
    const remaining = db().raw.prepare('SELECT post_id, observed_at FROM x_post_metrics ORDER BY post_id').all()
    expect(remaining).toEqual([
      { post_id: 'active', observed_at: NOW },
      { post_id: 'dormant', observed_at: ancient },
    ])
  })
})
