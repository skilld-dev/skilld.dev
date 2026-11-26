import type { XClient, XPost } from '../../shared/server/x-client'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ZERO_METRICS } from '../../shared/server/x-client'
import {
  refreshXEngagement,
  X_POST_METRICS_PRUNE_AT_SECOND_SQL,
  X_POST_METRICS_PRUNE_SCAN_SQL,
  xPostMetricsPruneDeleteSql,
} from '../../shared/server/x-refresh'
import { DEFAULT_REFRESH_POLICY } from '../../shared/x-refresh-policy'
import { createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0100_x_discovery_daily_budget.sql',
  // 0103 rebuilds discovery_ledger and copies the columns 0101 added, so it
  // cannot be applied without it.
  'migrations/0101_discovery_ledger_size_guard.sql',
  // `x_post_skills`: a post linked to a Skill is one trending reads.
  'migrations/0102_x_post_skills.sql',
  // Adds `platform`, which the claim query filters on so this task can never
  // send a Bluesky AT-URI to the X lookup endpoint.
  'migrations/0103_bluesky_discovery.sql',
  // Adds `author_avatar`, which a refresh must leave as discovery stored it.
  'migrations/0116_x_posts_author_avatar.sql',
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

/**
 * Insert a tracked post directly, bypassing discovery.
 *
 * Linked to a repository by default, because trending reads only linked
 * posts and so refresh pays only for them.
 */
function seedPost(input: {
  id: string
  postedAt?: number
  favourites?: number
  tier?: 'hot' | 'warm' | 'frozen'
  nextRefreshAt?: number
  metricsUpdatedAt?: number
  linked?: 'repo' | 'skill' | false
}) {
  const linked = input.linked ?? 'repo'
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
  if (linked === 'repo')
    db().raw.prepare(`INSERT INTO x_post_repos (post_id, owner, repo, match_kind) VALUES (?, 'antfu', 'skills', 'link')`).run(input.id)
  if (linked === 'skill') {
    db().raw.prepare(
      `INSERT INTO x_post_skills (post_id, owner, repo, slug, canonical_name, skill_path, detection, matched_on, verified_at)
       VALUES (?, 'antfu', 'skills', 'vitest', 'vitest', 'skills/vitest', 'slash', 'registry', ?)`,
    ).run(input.id, NOW - HOUR)
  }
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
    authorAvatar: null,
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

  // Trending reads engagement only for posts linked to a repository or a
  // Skill. Half of discovered posts link neither, and each refresh that
  // crossed midnight UTC billed them again for a number nothing read.
  it('freezes a post that links no repository or Skill without paying to read it', async () => {
    seedPost({ id: 'linked' })
    seedPost({ id: 'loose', linked: false })
    const { client, requested } = stubClient([freshPost('linked', 5), freshPost('loose', 5)])

    const summary = await refreshXEngagement({ db: db().db, client, now: NOW })

    expect(requested).toEqual([['linked']])
    expect(summary.postsRead).toBe(1)
    expect(summary.unlinked).toBe(1)
    expect(db().raw.prepare('SELECT post_id, refresh_tier FROM x_posts ORDER BY post_id').all()).toEqual([
      { post_id: 'linked', refresh_tier: 'hot' },
      { post_id: 'loose', refresh_tier: 'frozen' },
    ])
  })

  it('still refreshes a post linked only to a Skill', async () => {
    seedPost({ id: 'skill', linked: 'skill' })
    const { client, requested } = stubClient([freshPost('skill', 5)])

    await refreshXEngagement({ db: db().db, client, now: NOW })

    expect(requested).toEqual([['skill']])
  })

  it('keeps a held avatar when the lookup returns none', async () => {
    seedPost({ id: '1' })
    db().raw.prepare(`UPDATE x_posts SET author_avatar = ? WHERE post_id = '1'`).run('https://pbs.twimg.com/profile_images/1/held_normal.jpg')
    const { client } = stubClient([freshPost('1', 5)])

    await refreshXEngagement({ db: db().db, client, now: NOW })

    const row = db().raw.prepare('SELECT author_avatar FROM x_posts').get()
    expect(row).toEqual({ author_avatar: 'https://pbs.twimg.com/profile_images/1/held_normal.jpg' })
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

  it('prunes expired intermediate snapshots for frozen posts while keeping latest and in-window rows', async () => {
    const expired = NOW - 40 * 24 * HOUR
    const recent = NOW - 10 * 24 * HOUR
    seedPost({ id: 'frozen-multi', tier: 'frozen', postedAt: expired - 12 * HOUR, metricsUpdatedAt: expired })
    seedPost({ id: 'frozen-single', tier: 'frozen', postedAt: expired - 12 * HOUR, metricsUpdatedAt: expired })
    seedPost({ id: 'frozen-recent', tier: 'frozen', postedAt: recent - 12 * HOUR, metricsUpdatedAt: recent })

    const insertSnapshot = db().raw.prepare(
      `INSERT INTO x_post_metrics (post_id, observed_at, favourite_count, repost_count,
         reply_count, quote_count, bookmark_count, impression_count)
       VALUES (?, ?, ?, 0, 0, 0, 0, 0)`,
    )
    insertSnapshot.run('frozen-multi', expired - 2 * HOUR, 1)
    insertSnapshot.run('frozen-multi', expired - HOUR, 5)
    insertSnapshot.run('frozen-multi', expired, 10)
    insertSnapshot.run('frozen-single', expired, 3)
    insertSnapshot.run('frozen-recent', recent - 2 * HOUR, 1)
    insertSnapshot.run('frozen-recent', recent - HOUR, 4)
    insertSnapshot.run('frozen-recent', recent, 8)

    const { client } = stubClient([])
    const first = await refreshXEngagement({ db: db().db, client, now: NOW })

    expect(first.snapshotsPruned).toBe(2)
    expect(
      db().raw.prepare('SELECT post_id, observed_at FROM x_post_metrics ORDER BY post_id, observed_at').all(),
    ).toEqual([
      { post_id: 'frozen-multi', observed_at: expired },
      { post_id: 'frozen-recent', observed_at: recent - 2 * HOUR },
      { post_id: 'frozen-recent', observed_at: recent - HOUR },
      { post_id: 'frozen-recent', observed_at: recent },
      { post_id: 'frozen-single', observed_at: expired },
    ])

    // Steady-state next run advances past already-swept rows without rescanning them.
    const second = await refreshXEngagement({ db: db().db, client, now: NOW + HOUR })
    expect(second.snapshotsPruned).toBe(0)
  })

  it('drains a frozen snapshot backlog across bounded runs including same-second ties', async () => {
    const t1 = NOW - 60 * 24 * HOUR
    const t2 = NOW - 50 * 24 * HOUR
    const t3 = NOW - 40 * 24 * HOUR
    for (const id of ['p1', 'p2', 'p3'])
      seedPost({ id, tier: 'frozen', postedAt: t1 - HOUR, metricsUpdatedAt: t3 })

    const insertSnapshot = db().raw.prepare(
      `INSERT INTO x_post_metrics (post_id, observed_at, favourite_count, repost_count,
         reply_count, quote_count, bookmark_count, impression_count)
       VALUES (?, ?, 1, 0, 0, 0, 0, 0)`,
    )
    // Three posts share exact timestamp t1 (> pruneScanLimit: 2), plus later rows at t2 and t3.
    insertSnapshot.run('p1', t1)
    insertSnapshot.run('p2', t1)
    insertSnapshot.run('p3', t1)
    insertSnapshot.run('p1', t2)
    insertSnapshot.run('p2', t2)
    insertSnapshot.run('p3', t2)
    insertSnapshot.run('p1', t3)
    insertSnapshot.run('p2', t3)
    insertSnapshot.run('p3', t3)

    const { client } = stubClient([])
    const run1 = await refreshXEngagement({ db: db().db, client, now: NOW, pruneScanLimit: 2 })
    const run2 = await refreshXEngagement({ db: db().db, client, now: NOW + HOUR, pruneScanLimit: 2 })
    const run3 = await refreshXEngagement({ db: db().db, client, now: NOW + 2 * HOUR, pruneScanLimit: 2 })

    expect(run1.snapshotsPruned + run2.snapshotsPruned + run3.snapshotsPruned).toBe(6)
    expect(
      db().raw.prepare('SELECT post_id, observed_at FROM x_post_metrics ORDER BY post_id, observed_at').all(),
    ).toEqual([
      { post_id: 'p1', observed_at: t3 },
      { post_id: 'p2', observed_at: t3 },
      { post_id: 'p3', observed_at: t3 },
    ])
  })

  it('advances the prune watermark across distinct-timestamp batches without skipping rows', async () => {
    const base = NOW - 60 * 24 * HOUR
    const posts = ['d1', 'd2', 'd3']
    const insertSnapshot = db().raw.prepare(
      `INSERT INTO x_post_metrics (post_id, observed_at, favourite_count, repost_count,
         reply_count, quote_count, bookmark_count, impression_count)
       VALUES (?, ?, 1, 0, 0, 0, 0, 0)`,
    )
    posts.forEach((id, i) => {
      const start = base + i * 100
      seedPost({ id, tier: 'frozen', postedAt: start, metricsUpdatedAt: start + 10 })
      insertSnapshot.run(id, start)
      insertSnapshot.run(id, start + 10)
    })

    const { client } = stubClient([])
    let totalPruned = 0
    for (let run = 0; run < 5; run++)
      totalPruned += (await refreshXEngagement({ db: db().db, client, now: NOW + run * HOUR, pruneScanLimit: 2 })).snapshotsPruned

    expect(totalPruned).toBe(3)
    expect(
      db().raw.prepare('SELECT post_id, observed_at FROM x_post_metrics ORDER BY post_id, observed_at').all(),
    ).toEqual([
      { post_id: 'd1', observed_at: base + 10 },
      { post_id: 'd2', observed_at: base + 110 },
      { post_id: 'd3', observed_at: base + 210 },
    ])
  })

  it('uses idx_x_post_metrics_observed and primary key seeks without full scans', () => {
    const explain = (sql: string, ...params: unknown[]): string =>
      (db().raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>)
        .map(row => row.detail)
        .join('\n')

    const scanPlan = explain(X_POST_METRICS_PRUNE_SCAN_SQL, 0, NOW - 30 * 24 * HOUR, 500)
    expect(scanPlan).toContain('idx_x_post_metrics_observed (observed_at>? AND observed_at<?)')
    expect(scanPlan).not.toContain('SCAN')

    const tiePlan = explain(X_POST_METRICS_PRUNE_AT_SECOND_SQL, NOW - 30 * 24 * HOUR)
    expect(tiePlan).toContain('idx_x_post_metrics_observed (observed_at=?)')
    expect(tiePlan).not.toContain('SCAN')

    const deletePlan = explain(xPostMetricsPruneDeleteSql(2), 'p1', 'p2', NOW - 30 * 24 * HOUR)
    expect(deletePlan).toContain('SEARCH x_post_metrics USING COVERING INDEX sqlite_autoindex_x_post_metrics_1 (post_id=? AND observed_at<?)')
    expect(deletePlan).toContain('SEARCH newer USING COVERING INDEX sqlite_autoindex_x_post_metrics_1 (post_id=? AND observed_at>?)')
    expect(deletePlan).not.toContain('SCAN')
  })
})
