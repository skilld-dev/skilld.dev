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
 * FOUR ARMS, ORDERED BY PRECISION, AND THE ORDERING IS THE WHOLE DESIGN.
 *
 *   1. `url:"skilld.dev"`  anyone linking us, whatever they say.
 *   2. `"SKILL.md"` and the install commands, with NO url requirement. These
 *      tokens are specific enough to stand alone: a probe of 10 results
 *      returned 10 genuine skill posts.
 *   3. GitHub links plus ecosystem vocabulary. The original query.
 *   4. Loose vocabulary gated behind `min_likes:75`.
 *
 * WHY ARM 2 EXISTS AT ALL. Every earlier arm required a URL, and that quietly
 * decided what kind of person this feed could see. Measured against production:
 * 69 X posts captured ever, the most-liked at 31, and zero above 100. A probe
 * of high-engagement skill posts found 0 to 1 in 10 carried a github.com link,
 * because a post that goes viral is commentary, a screenshot, or a thread with
 * the link in a reply. The query was selecting for link-dumpers and excluding
 * everyone else, which is exactly why the board read as weak.
 *
 * WHY ARM 4 IS GATED SO HIGH. The same probe run without a floor returned
 * crypto spam ("JUST LIT THE FUSE! $200 for link") and AI-hustle threads
 * ("I'm making over $10K a month selling AI services") at 149 to 4,657 likes.
 * "claude skill" and "agent skills" are contaminated phrases. The floor buys
 * back precision, and `min_likes` scoped inside a nested OR group is valid API
 * syntax, verified against the live endpoint.
 *
 * `--skill` was tried as an install marker and rejected: X tokenizes it
 * loosely and it matched "skill issue" and "skill behind the screen".
 *
 * `-is:retweet` is a cost control as much as a quality one: a retweet carries
 * the same links as its original, would be read as a separate post against the
 * cap, and adds nothing the original does not already say.
 *
 * The language clause matches the surfaces that quote these posts, and saves
 * about a quarter of the budget: 74 of 299 posts measured on 2026-08-13 were
 * non-English.
 *
 * `zxx` is included deliberately. It means "no linguistic content", which X
 * assigns to a post whose text is nothing but a link, and that is exactly the
 * shape of an X Article. dexhorthy's /show-me article carried 6,614 bookmarks
 * with `lang: zxx`, so filtering on `lang:en` alone would discard the single
 * highest-engagement skill post we have seen.
 */
export const X_DISCOVERY_QUERY = '(url:"skilld.dev" OR "SKILL.md" OR "npx skills add" OR "npx skilld add" OR (url:"github.com" ("skills.md" OR "agent skill" OR "agent skills" OR "claude skill" OR "claude skills" OR "claude code skill" OR "agentskills")) OR (("claude skill" OR "claude skills" OR "agent skills" OR "claude code skill") min_likes:75)) -is:retweet (lang:en OR lang:zxx)'

/** Cursor key, so a second query can be added later without a schema change. */
export const X_DISCOVERY_CURSOR_KEY = 'discovery-v1'

/**
 * How far back X's recent-search endpoint can look. A `since_id` older than
 * this is below the retention floor, and every search carrying it answers
 * HTTP 400.
 */
export const X_SEARCH_RETENTION_SECONDS = 7 * 24 * 60 * 60

/**
 * Headroom before a cursor is treated as expired. `since_id_written_at` dates
 * the id by the run that wrote it, and the newest post seen that run was
 * published up to a poll interval before it, so the drop fires a little early
 * on purpose: re-reading a few in-window posts costs cap units, while a dead
 * cursor costs discovery itself.
 */
export const CURSOR_STALE_MARGIN_SECONDS = 24 * 60 * 60

/**
 * Ceiling on pages per run. At observed volume (~250 matching posts/day) a
 * single 100-result page covers a 15-minute window many times over, so this
 * only ever binds on a cold start. When it does bind the summary says so
 * rather than quietly dropping the tail.
 */
const MAX_PAGES_PER_RUN = 5

/**
 * Returned post reads discovery may consume per UTC day.
 *
 * This is a request ceiling, not a prepaid allowance or billed usage.
 * X normally deduplicates resource charges within each UTC day. Returned
 * reads still consume our ceiling, including repeats after cursor recovery.
 * Bounded runs retain their continuation so the ceiling pays for the unread
 * tail before discovery polls for newer posts.
 */
export const DAILY_DISCOVERY_READ_BUDGET = 2000

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
  /** True when pagination reached the end of the window, so the cursor moved. */
  windowExhausted: boolean
  /** True when the daily read budget stopped the run. Expect this most days. */
  budgetExhausted: boolean
  /** Charged reads spent today after this run, against DAILY_DISCOVERY_READ_BUDGET. */
  budgetSpentToday: number
  cursorAdvancedTo: string | null
  /**
   * True when the stored cursor had gone stale past X's retention window and
   * was dropped, so this run cold-started instead of answering HTTP 400 until
   * someone advanced the cursor by hand.
   */
  cursorReset: boolean
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

type SearchWindow = { _tag: 'idle' } | { _tag: 'paused', nextToken: string, newestId: string | null, startedAt: number }

interface StoredCursor {
  /** The id to search from, or null for a cold start. */
  sinceId: string | null
  /** True when a stored cursor was dropped for predating the retention window. */
  staleReset: boolean
  window: SearchWindow
}

async function readCursor(db: D1Database, key: string, now: number): Promise<StoredCursor> {
  const row = await db
    .prepare(`SELECT since_id, since_id_written_at, next_token, pending_newest_id, pending_started_at FROM x_ingest_cursor WHERE query_key = ?1`)
    .bind(key)
    .first<{ since_id: string | null, since_id_written_at: number | null, next_token: string | null, pending_newest_id: string | null, pending_started_at: number | null }>()
  const sinceId = row?.since_id ?? null
  const writtenAt = row?.since_id_written_at ?? null
  const window: SearchWindow = row?.next_token && row.pending_started_at !== null
    ? { _tag: 'paused', nextToken: row.next_token, newestId: row.pending_newest_id, startedAt: row.pending_started_at }
    : { _tag: 'idle' }
  if (!sinceId && window._tag === 'idle')
    return { sinceId: null, staleReset: false, window }

  // `since_id_written_at` dates the cursor by the run that wrote it. Dating it
  // by `last_run_at` instead was the bug this column fixed: held and failing
  // runs refresh `last_run_at` while the COALESCE keeps the old id, so a dead
  // id read as fresh forever on the 15-minute schedule. A cursor with no
  // timestamp cannot be dated and is dropped with the rest.
  const datedAt = window._tag === 'paused'
    ? (writtenAt === null ? window.startedAt : Math.min(writtenAt, window.startedAt))
    : writtenAt
  const fresh = datedAt !== null
    && now - datedAt <= X_SEARCH_RETENTION_SECONDS - CURSOR_STALE_MARGIN_SECONDS
  if (fresh)
    return { sinceId, staleReset: false, window }

  // Cleared here, not only in the end-of-run upsert: that upsert COALESCEs a
  // held (null) advance into the stored value, so a run that later fails or
  // truncates would otherwise hand the same dead cursor to the next run and
  // the 400s would never stop.
  await db
    .prepare(`UPDATE x_ingest_cursor SET since_id = NULL, since_id_written_at = NULL, next_token = NULL, pending_newest_id = NULL, pending_started_at = NULL WHERE query_key = ?1`)
    .bind(key)
    .run()
  return { sinceId: null, staleReset: true, window: { _tag: 'idle' } }
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
    cursorWrittenAt: number
    window: SearchWindow
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
         query_key, since_id, since_id_written_at, last_run_at, last_result_count,
         posts_read_total, budget_day, budget_spent,
         next_token, pending_newest_id, pending_started_at
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT (query_key) DO UPDATE SET
         since_id = COALESCE(excluded.since_id, x_ingest_cursor.since_id),
         -- The timestamp must move only when the id does: a held advance keeps
         -- the prior write time, so the stored id keeps aging while runs fail
         -- or hold, and the retention drop still fires.
         since_id_written_at = CASE
           WHEN excluded.since_id IS NOT NULL THEN excluded.since_id_written_at
           ELSE x_ingest_cursor.since_id_written_at
         END,
         last_run_at = excluded.last_run_at,
         last_result_count = excluded.last_result_count,
         posts_read_total = x_ingest_cursor.posts_read_total + excluded.posts_read_total,
         -- Absolute, not additive: the caller already folded in what today had
         -- spent before this run, and rolled it to 0 on a new UTC day.
         budget_day = excluded.budget_day,
         budget_spent = excluded.budget_spent,
         next_token = excluded.next_token,
         pending_newest_id = excluded.pending_newest_id,
         pending_started_at = excluded.pending_started_at`,
    )
    .bind(
      key,
      input.sinceId,
      input.sinceId === null ? null : input.cursorWrittenAt,
      input.now,
      input.resultCount,
      input.postsRead,
      input.budgetDay,
      input.budgetSpent,
      input.window._tag === 'paused' ? input.window.nextToken : null,
      input.window._tag === 'paused' ? input.window.newestId : null,
      input.window._tag === 'paused' ? input.window.startedAt : null,
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
         refresh_tier, next_refresh_at, author_avatar
       ) VALUES (?1, ?2, ?3, ?17, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'hot', ?16, ?18)
       ON CONFLICT (post_id) DO UPDATE SET
         author_handle = excluded.author_handle,
         author_name = excluded.author_name,
         author_avatar = COALESCE(excluded.author_avatar, x_posts.author_avatar),
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
      post.authorAvatar,
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
    windowExhausted: false,
    budgetExhausted: false,
    budgetSpentToday: 0,
    cursorAdvancedTo: null,
    cursorReset: false,
    error: null,
    elapsedMs: 0,
  }

  const cursor = await readCursor(db, X_DISCOVERY_CURSOR_KEY, now)
  const sinceId = cursor.sinceId
  summary.cursorReset = cursor.staleReset

  const today = utcDayKey(now)
  const spentBefore = await readBudgetSpent(db, X_DISCOVERY_CURSOR_KEY, today)
  let spent = spentBefore

  const collected: XPost[] = []
  let nextToken = cursor.window._tag === 'paused' ? cursor.window.nextToken : null
  let newestId = cursor.window._tag === 'paused' ? cursor.window.newestId : null
  const windowStartedAt = cursor.window._tag === 'paused' ? cursor.window.startedAt : now
  // Only true once pagination reached the end of the window, meaning every
  // post newer than the cursor has been seen.
  let windowExhausted = false

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

    if (!nextToken) {
      windowExhausted = true
      break
    }
    if (page === MAX_PAGES_PER_RUN - 1)
      summary.truncated = true
  }

  const repos = new Map<string, DiscoveredRepo>()
  const statements: D1PreparedStatement[] = []

  for (const post of collected) {
    const refs = extractRepoReferences({ urls: post.urls, text: post.text })

    // EVERY POST WE PAID FOR IS STORED, repo link or not.
    //
    // This used to `continue` here, discarding the post entirely. We were
    // buying a read and throwing the result away, so the same post cost cap
    // again on any later pass and no improvement to detection could ever be
    // applied retroactively. It also silently destroyed exactly the posts the
    // broadened query now exists to catch: a viral post naming a skill in
    // prose carries no repo reference at this stage.
    //
    // A post with no reference simply gets no `x_post_repos` rows. It stays in
    // `x_posts` for `skill-mention-scan` to revisit as detection improves.
    if (refs.length === 0)
      summary.postsSkippedNoRepo += 1

    summary.postsStored += 1
    statements.push(...postWriteStatements(db, post, refs, now))

    // Split the post's endorsement across everything it endorses.
    //
    // A live run surfaced why: one popular "here are 20 agent-skill repos"
    // thread gave n8n, coolify, ghost and seventeen others an identical 5,063,
    // which put them at the top of the review queue ahead of repos a post was
    // actually about. A post naming one repo is a recommendation; a post naming
    // twenty is a list, and each entry carries a twentieth of the weight.
    // Guarded: `refs` may now be empty, and dividing by zero would put
    // Infinity into `evidence_score` if the loop below ever ran on it.
    const score = refs.length === 0 ? 0 : weighted(post) / refs.length
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

  summary.windowExhausted = windowExhausted
  summary.budgetSpentToday = spent
  // The cursor only moves when the whole window was consumed.
  //
  // It used to advance to the first page's newest id regardless, so a run cut
  // short by the daily budget jumped the cursor past everything it had not
  // read and those posts were gone for good. Because the budget is spent by
  // the first run after UTC midnight, that discarded almost a full day of the
  // stream, every day, and biased what survived towards the youngest posts.
  //
  // Keep the unread page and the first page's newest id together. The next
  // run resumes the tail, then advances to that original id. Restarting page
  // one on every run exhausted the budget without ever reaching the tail.
  const advanceTo = windowExhausted ? newestId : null
  await writeCursor(db, X_DISCOVERY_CURSOR_KEY, {
    sinceId: advanceTo,
    cursorWrittenAt: windowStartedAt,
    window: nextToken === null
      ? { _tag: 'idle' }
      : { _tag: 'paused', nextToken, newestId, startedAt: windowStartedAt },
    now,
    resultCount: collected.length,
    postsRead: summary.postsRead,
    budgetDay: today,
    budgetSpent: spent,
  })
  summary.cursorAdvancedTo = advanceTo

  summary.elapsedMs = Date.now() - startedAt
  return summary
}
