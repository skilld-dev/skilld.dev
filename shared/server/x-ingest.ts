/**
 * Discovery: poll X for posts referencing GitHub repos, persist them, and
 * record every unknown repo in the shared review ledger.
 *
 * Dependencies are arguments, not imports: the database, the API client and
 * the clock all arrive through {@link XIngestDeps}. That is what lets the
 * whole ingest run under test with an in-memory SQLite database and a stub
 * client, with no network and no cap spend.
 */

import type { RepoReference } from '#shared/x-references'
import type { XClient, XError, XPost } from './x-client'
import { DEFAULT_TRENDING_WEIGHTS } from '#shared/trending-score'
import { extractRepoReferences } from '#shared/x-references'
import { DEFAULT_REFRESH_POLICY } from '#shared/x-refresh-policy'
import { upsertLedgerEntry } from './discovery-ledger'
import { X_SEARCH_PAGE_SIZE } from './x-client'

/**
 * The one query the discovery poll runs.
 *
 * Two arms. The first catches anyone linking us directly, whatever they say.
 * The second catches GitHub links in posts that use the ecosystem's own
 * vocabulary, which is how a repo we have never heard of shows up.
 *
 * `-is:retweet` is a cost control as much as a quality one: a retweet carries
 * the same links as its original, would be read as a separate post against the
 * cap, and adds nothing the original does not already say.
 */
export const X_DISCOVERY_QUERY = '(url:"skilld.dev" OR (url:"github.com" ("SKILL.md" OR "skills.md" OR "agent skill" OR "agent skills" OR "claude skill" OR "claude skills" OR "claude code skill" OR "agentskills"))) -is:retweet'

/** Cursor key, so a second query can be added later without a schema change. */
export const X_DISCOVERY_CURSOR_KEY = 'discovery-v1'

/**
 * Ceiling on pages per run. At observed volume (~250 matching posts/day) a
 * single 100-result page covers a 15-minute window many times over, so this
 * only ever binds on a cold start. When it does bind the summary says so
 * rather than quietly dropping the tail.
 */
const MAX_PAGES_PER_RUN = 5

/**
 * Charged post reads discovery may spend per UTC day.
 *
 * This is the whole cost control for the feature. Every post the search
 * returns costs $0.005 whether or not we keep it, so spend is set by what the
 * query matches, not by how often we poll. 22 reads/day is ~$3.30/month, and
 * the refresh task adds roughly half that again when a hot window crosses
 * midnight, landing the feature just under $5/month.
 *
 * Raising this is the single dial for "see more of X". It is linear: each
 * extra read/day is $0.15/month.
 */
export const DAILY_DISCOVERY_READ_BUDGET = 22

/** X rejects a search with max_results below this, so a smaller remainder ends the run. */
const MIN_SEARCH_PAGE_SIZE = 10

/** UTC date as YYYY-MM-DD, the window X deduplicates charges over. */
export function utcDayKey(nowSeconds: number): string {
  return new Date(nowSeconds * 1000).toISOString().slice(0, 10)
}

/** D1 caps statements per batch; well under it, and keeps memory flat. */
const WRITE_CHUNK = 20

export interface XIngestDeps {
  db: D1Database
  client: XClient
  /** Unix seconds. Injected so tests are deterministic. */
  now: number
  /** Called once per repo that was not already in the ledger. */
  onNewRepo?: (repo: DiscoveredRepo) => void
}

export interface DiscoveredRepo {
  owner: string
  repo: string
  evidenceUrl: string
  evidenceText: string
  evidenceScore: number
}

export interface XIngestSummary {
  postsRead: number
  postsStored: number
  postsSkippedNoRepo: number
  reposSeen: number
  ledgerInserted: number
  ledgerUpdated: number
  pagesFetched: number
  /** True when MAX_PAGES_PER_RUN stopped the run before the window emptied. */
  truncated: boolean
  /** True when the daily read budget stopped the run. Expect this most days. */
  budgetExhausted: boolean
  /** Charged reads spent today after this run, against DAILY_DISCOVERY_READ_BUDGET. */
  budgetSpentToday: number
  cursorAdvancedTo: string | null
  error: XError | null
  elapsedMs: number
}

function weighted(post: XPost): number {
  const w = DEFAULT_TRENDING_WEIGHTS
  const m = post.metrics
  return m.favouriteCount * w.favourite
    + m.repostCount * w.repost
    + m.replyCount * w.reply
    + m.quoteCount * w.quote
    + m.bookmarkCount * w.bookmark
}

function truncateText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function postUrl(post: XPost): string {
  return `https://x.com/${post.authorHandle}/status/${post.id}`
}

async function readCursor(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT since_id FROM x_ingest_cursor WHERE query_key = ?1`)
    .bind(key)
    .first<{ since_id: string | null }>()
  return row?.since_id ?? null
}

/**
 * Reads already charged today. A stored day other than today means the row is
 * stale and the budget has reset, so it reads as zero rather than being
 * written back here: the run persists its own total when it finishes.
 */
async function readBudgetSpent(db: D1Database, key: string, today: string): Promise<number> {
  const row = await db
    .prepare(`SELECT budget_day, budget_spent FROM x_ingest_cursor WHERE query_key = ?1`)
    .bind(key)
    .first<{ budget_day: string | null, budget_spent: number | null }>()
  if (!row || row.budget_day !== today)
    return 0
  return row.budget_spent ?? 0
}

async function writeCursor(
  db: D1Database,
  key: string,
  input: {
    sinceId: string | null
    now: number
    resultCount: number
    postsRead: number
    budgetDay: string
    budgetSpent: number
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO x_ingest_cursor (
         query_key, since_id, last_run_at, last_result_count, posts_read_total,
         budget_day, budget_spent
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (query_key) DO UPDATE SET
         since_id = COALESCE(excluded.since_id, x_ingest_cursor.since_id),
         last_run_at = excluded.last_run_at,
         last_result_count = excluded.last_result_count,
         posts_read_total = x_ingest_cursor.posts_read_total + excluded.posts_read_total,
         -- Absolute, not additive: the caller already folded in what today had
         -- spent before this run, and rolled it to 0 on a new UTC day.
         budget_day = excluded.budget_day,
         budget_spent = excluded.budget_spent`,
    )
    .bind(
      key,
      input.sinceId,
      input.now,
      input.resultCount,
      input.postsRead,
      input.budgetDay,
      input.budgetSpent,
    )
    .run()
}

/**
 * Persist one post plus its repo references and opening metrics snapshot.
 *
 * On re-ingest of a post we already hold (possible when a cursor is reset),
 * engagement is refreshed but `first_seen_at` and the existing tier are left
 * alone, so a re-run never resurrects a frozen post onto the paid tier.
 */
function postWriteStatements(
  db: D1Database,
  post: XPost,
  refs: RepoReference[],
  now: number,
): D1PreparedStatement[] {
  const m = post.metrics
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO x_posts (
         post_id, author_id, author_handle, author_name, author_followers, text_extract, lang,
         posted_at, first_seen_at, favourite_count, repost_count, reply_count,
         quote_count, bookmark_count, impression_count, metrics_updated_at,
         refresh_tier, next_refresh_at
       ) VALUES (?1, ?2, ?3, ?17, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'hot', ?16)
       ON CONFLICT (post_id) DO UPDATE SET
         author_handle = excluded.author_handle,
         author_name = excluded.author_name,
         author_followers = excluded.author_followers,
         favourite_count = excluded.favourite_count,
         repost_count = excluded.repost_count,
         reply_count = excluded.reply_count,
         quote_count = excluded.quote_count,
         bookmark_count = excluded.bookmark_count,
         impression_count = excluded.impression_count,
         metrics_updated_at = excluded.metrics_updated_at`,
    ).bind(
      post.id,
      post.authorId,
      post.authorHandle,
      post.authorFollowers,
      truncateText(post.text, 1000),
      post.lang,
      post.postedAt,
      now,
      m.favouriteCount,
      m.repostCount,
      m.replyCount,
      m.quoteCount,
      m.bookmarkCount,
      m.impressionCount,
      now,
      now + DEFAULT_REFRESH_POLICY.hotIntervalSeconds,
      post.authorName,
    ),
    db.prepare(
      `INSERT OR REPLACE INTO x_post_metrics (
         post_id, observed_at, favourite_count, repost_count, reply_count,
         quote_count, bookmark_count, impression_count
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(
      post.id,
      now,
      m.favouriteCount,
      m.repostCount,
      m.replyCount,
      m.quoteCount,
      m.bookmarkCount,
      m.impressionCount,
    ),
  ]

  for (const ref of refs) {
    statements.push(
      db.prepare(
        `INSERT INTO x_post_repos (post_id, owner, repo, match_kind)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (post_id, owner, repo) DO UPDATE SET match_kind = excluded.match_kind`,
      ).bind(post.id, ref.owner, ref.repo, ref.matchKind),
    )
  }

  return statements
}

async function runInChunks(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += WRITE_CHUNK)
    await db.batch(statements.slice(i, i + WRITE_CHUNK))
}

export async function ingestXMentions(deps: XIngestDeps): Promise<XIngestSummary> {
  const startedAt = Date.now()
  const { db, client, now } = deps

  const summary: XIngestSummary = {
    postsRead: 0,
    postsStored: 0,
    postsSkippedNoRepo: 0,
    reposSeen: 0,
    ledgerInserted: 0,
    ledgerUpdated: 0,
    pagesFetched: 0,
    truncated: false,
    budgetExhausted: false,
    budgetSpentToday: 0,
    cursorAdvancedTo: null,
    error: null,
    elapsedMs: 0,
  }

  const sinceId = await readCursor(db, X_DISCOVERY_CURSOR_KEY)

  const today = utcDayKey(now)
  const spentBefore = await readBudgetSpent(db, X_DISCOVERY_CURSOR_KEY, today)
  let spent = spentBefore

  const collected: XPost[] = []
  let nextToken: string | null = null
  let newestId: string | null = null

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    // Checked before the request, not after: a page is charged the moment it
    // returns, so an over-budget run must never send it.
    const remaining = DAILY_DISCOVERY_READ_BUDGET - spent
    if (remaining < MIN_SEARCH_PAGE_SIZE) {
      summary.budgetExhausted = true
      break
    }

    const result = await client.searchRecent({
      query: X_DISCOVERY_QUERY,
      sinceId,
      nextToken,
      maxResults: Math.min(X_SEARCH_PAGE_SIZE, remaining),
    })

    if (result._tag === 'err') {
      // Keep whatever earlier pages returned: those posts are already paid for
      // and discarding them would mean paying again next run.
      summary.error = result.error
      break
    }

    summary.pagesFetched += 1
    summary.postsRead += result.value.postsRead
    spent += result.value.postsRead
    collected.push(...result.value.posts)
    // The first page holds the newest results, so its newest_id is the cursor.
    newestId ??= result.value.newestId
    nextToken = result.value.nextToken

    if (!nextToken)
      break
    if (page === MAX_PAGES_PER_RUN - 1)
      summary.truncated = true
  }

  const repos = new Map<string, DiscoveredRepo>()
  const statements: D1PreparedStatement[] = []

  for (const post of collected) {
    const refs = extractRepoReferences({ urls: post.urls, text: post.text })
    if (refs.length === 0) {
      // Matched the query but pointed at no repo we can act on: a discussion
      // post, or a link to a GitHub page that is not a repository.
      summary.postsSkippedNoRepo += 1
      continue
    }

    summary.postsStored += 1
    statements.push(...postWriteStatements(db, post, refs, now))

    // Split the post's endorsement across everything it endorses.
    //
    // A live run surfaced why: one popular "here are 20 agent-skill repos"
    // thread gave n8n, coolify, ghost and seventeen others an identical 5,063,
    // which put them at the top of the review queue ahead of repos a post was
    // actually about. A post naming one repo is a recommendation; a post naming
    // twenty is a list, and each entry carries a twentieth of the weight.
    const score = weighted(post) / refs.length
    for (const ref of refs) {
      const key = `${ref.owner}/${ref.repo}`
      const held = repos.get(key)
      if (!held || score > held.evidenceScore) {
        repos.set(key, {
          owner: ref.owner,
          repo: ref.repo,
          evidenceUrl: postUrl(post),
          evidenceText: post.text,
          evidenceScore: score,
        })
      }
    }
  }

  await runInChunks(db, statements)

  summary.reposSeen = repos.size
  for (const repo of repos.values()) {
    const outcome = await upsertLedgerEntry({ db, source: 'x', repo, now })
    if (outcome === 'inserted') {
      summary.ledgerInserted += 1
      deps.onNewRepo?.(repo)
    }
    else {
      summary.ledgerUpdated += 1
    }
  }

  summary.budgetSpentToday = spent
  await writeCursor(db, X_DISCOVERY_CURSOR_KEY, {
    sinceId: newestId,
    now,
    resultCount: collected.length,
    postsRead: summary.postsRead,
    budgetDay: today,
    budgetSpent: spent,
  })
  summary.cursorAdvancedTo = newestId

  summary.elapsedMs = Date.now() - startedAt
  return summary
}
