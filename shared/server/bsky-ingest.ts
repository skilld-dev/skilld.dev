/**
 * Discovery: poll Bluesky for posts referencing GitHub repos, persist them,
 * and record every unknown repo in the shared review ledger.
 *
 * Mirrors `x-ingest.ts` in shape, and deliberately not in mechanism. The X
 * ingest is built around a metered API: a `since_id` cursor so each post is
 * charged once, a daily read budget, a page ceiling, and a separate tiered
 * refresh task to re-measure engagement without burning the cap. None of that
 * applies here, because nothing is charged.
 *
 * WHY A FIXED LOOKBACK WINDOW AND NO CURSOR.
 * Re-reading a post costs nothing on this platform, so the ingest simply
 * rescans the last {@link LOOKBACK_DAYS} days on every run. Two things fall
 * out for free that the X pipeline needs dedicated machinery to get:
 *
 *   1. Engagement stays fresh. Every post inside the window is re-observed on
 *      every run, which is what feeds velocity scoring. There is no Bluesky
 *      equivalent of `refresh-x-engagement` and there does not need to be.
 *   2. Nothing is ever lost. A cursor that advances past unread results is the
 *      failure mode that cost the X ingest most of a day's stream; a window
 *      that always starts from a wall-clock offset cannot have it.
 *
 * At observed volume (~2 repo-bearing posts/day, ~400 matched posts/month) a
 * 7-day window is a few hundred posts across a dozen requests.
 *
 * Dependencies are arguments, not imports: the database, the API client and
 * the clock all arrive through {@link BskyIngestDeps}, so the whole ingest runs
 * under test with an in-memory SQLite database and a stub client.
 */

import type { RepoReference } from '#shared/x-references'
import type { BskyClient, BskyPost } from './bsky-client'
import { BSKY_TRENDING_WEIGHTS } from '#shared/platform-weights'
import { extractRepoReferences } from '#shared/x-references'
import { BSKY_SEARCH_PAGE_SIZE } from './bsky-client'
import { upsertLedgerEntry } from './discovery-ledger'

/**
 * The discovery queries.
 *
 * Bluesky search has no OR operator, so X's single two-armed query becomes one
 * request per phrase. That is affordable here precisely because requests are
 * free and only rate-limited; on X the same expansion would multiply the bill.
 *
 * `domain:` is the AT Protocol equivalent of X's `url:` operator, and is the
 * only arm that catches a post linking us without using any of the vocabulary.
 *
 * No language filter. X's `lang:en OR lang:zxx` clause exists to stop paying
 * for posts we cannot read; with nothing to pay, excluding them would only
 * discard real signal. The window already surfaced Japanese, French and
 * Finnish posts naming genuine skill repos.
 */
export const BSKY_DISCOVERY_QUERIES = [
  'domain:skilld.dev',
  '"skilld.dev"',
  '"npx skilld"',
  '"SKILL.md"',
  '"skills.md"',
  '"agent skill"',
  '"agent skills"',
  '"claude skill"',
  '"claude skills"',
  '"claude code skill"',
  'agentskills',
]

/**
 * How far back each run looks.
 *
 * Long enough that a multi-day outage loses nothing, short enough that the
 * whole window is a few hundred posts. Raising it costs requests, not money.
 */
export const LOOKBACK_DAYS = 7

/**
 * Ceiling on pages per query. At observed volume one page covers the window
 * many times over, so this only binds if Bluesky volume grows by two orders of
 * magnitude, and when it binds the summary says so rather than going quiet.
 */
const MAX_PAGES_PER_QUERY = 5

/** D1 caps statements per batch; well under it, and keeps memory flat. */
const WRITE_CHUNK = 20

export interface BskyIngestDeps {
  db: D1Database
  client: BskyClient
  /** Unix seconds. Injected so tests are deterministic. */
  now: number
  /** Called once per repo that was not already in the ledger. */
  onNewRepo?: (repo: DiscoveredRepo) => void
  /** Overrides the lookback window, for tests and backfills. */
  lookbackDays?: number
}

export interface DiscoveredRepo {
  owner: string
  repo: string
  evidenceUrl: string
  evidenceText: string
  evidenceScore: number
}

export interface BskyIngestSummary {
  postsRead: number
  /** Posts the client could not parse. Non-zero means the API shape drifted. */
  postsUnparsable: number
  postsStored: number
  postsSkippedNoRepo: number
  /** Distinct posts after cross-query deduplication. */
  postsUnique: number
  reposSeen: number
  ledgerInserted: number
  ledgerUpdated: number
  requestsMade: number
  /** Queries whose page ceiling was hit before the window emptied. */
  truncatedQueries: string[]
  /** Queries that failed outright. Their posts are simply missing this run. */
  failedQueries: { query: string, error: string }[]
  /** True when an app password was in play, rather than anonymous reads. */
  authenticated: boolean
  elapsedMs: number
}

/**
 * One line naming why a run degraded, for the wide event.
 *
 * A degraded run is the hardest kind to triage after the fact. It finishes, so
 * `scheduled_runs` records `succeeded` with a null error; it reports `partial`
 * to `sync_jobs`, which holds one row per task and is overwritten by the next
 * run. On 2026-08-17 the nightly report went RED naming `sync-bsky-mentions`
 * and, hours later, nothing anywhere said which query failed.
 *
 * Every failed query is named, not just the first: one query failing is a bad
 * search term, all of them failing is the AppView being down, and a count
 * cannot tell those apart. The result is capped so a total outage cannot write
 * an unbounded string into the log.
 */
export function bskyFailureReason(
  failedQueries: BskyIngestSummary['failedQueries'],
  maxLength = 300,
): string | null {
  if (failedQueries.length === 0)
    return null
  return truncateText(failedQueries.map(f => `${f.query}: ${f.error}`).join('; '), maxLength)
}

/**
 * Weighted engagement for one post.
 *
 * Bluesky weights, never X's: there is no bookmark or impression count here,
 * and the scale is roughly two orders of magnitude smaller.
 */
function weighted(post: BskyPost): number {
  const w = BSKY_TRENDING_WEIGHTS
  const m = post.metrics
  return m.likeCount * w.favourite
    + m.repostCount * w.repost
    + m.replyCount * w.reply
    + m.quoteCount * w.quote
}

function truncateText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/**
 * A clickable permalink from an AT-URI.
 *
 * `at://did:plc:abc/app.bsky.feed.post/xyz` becomes
 * `https://bsky.app/profile/did:plc:abc/post/xyz`. The DID form is used rather
 * than the handle because a handle can be changed or lost, which would rot
 * every evidence link already written to the ledger.
 */
export function bskyPostUrl(post: BskyPost): string {
  const rkey = post.uri.split('/').pop()
  return `https://bsky.app/profile/${post.authorDid}/post/${rkey ?? ''}`
}

/**
 * The text discovery reads.
 *
 * The embed card matters more here than on X. A Bluesky post sharing a repo is
 * very often a bare link with the repo name and description living only in the
 * card, so scanning `text` alone would find no reference at all.
 */
function searchableText(post: BskyPost): string {
  return post.cardText ? `${post.text}\n${post.cardText}` : post.text
}

/**
 * Persist one post plus its repo references and a metrics snapshot.
 *
 * `refresh_tier` is 'frozen' on insert, and that is not a placeholder. Frozen
 * means "never claimed by `refresh-x-engagement`", which is required: that task
 * posts claimed ids to the X lookup endpoint, and an AT-URI sent there would
 * spend X cap on a guaranteed miss and never clear the row. Bluesky posts get
 * their metrics refreshed by simply falling inside the next run's window.
 *
 * `author_followers` and the bookmark and impression counts are stored as 0
 * because the platform does not report them on a search result. They are not
 * unknown-but-real values, and no scoring path reads them for this platform.
 */
function postWriteStatements(
  db: D1Database,
  post: BskyPost,
  refs: RepoReference[],
  now: number,
): D1PreparedStatement[] {
  const m = post.metrics
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO x_posts (
         post_id, platform, author_id, author_handle, author_name, author_followers,
         text_extract, lang, posted_at, first_seen_at, favourite_count, repost_count,
         reply_count, quote_count, bookmark_count, impression_count, metrics_updated_at,
         refresh_tier, next_refresh_at
       ) VALUES (?1, 'bsky', ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, 0, ?13, 'frozen', 0)
       ON CONFLICT (post_id) DO UPDATE SET
         author_handle = excluded.author_handle,
         author_name = excluded.author_name,
         favourite_count = excluded.favourite_count,
         repost_count = excluded.repost_count,
         reply_count = excluded.reply_count,
         quote_count = excluded.quote_count,
         metrics_updated_at = excluded.metrics_updated_at`,
    ).bind(
      post.uri,
      post.authorDid,
      post.authorHandle,
      post.authorName,
      truncateText(searchableText(post), 1000),
      post.lang,
      post.postedAt,
      now,
      m.likeCount,
      m.repostCount,
      m.replyCount,
      m.quoteCount,
      now,
    ),
    db.prepare(
      `INSERT OR REPLACE INTO x_post_metrics (
         post_id, observed_at, favourite_count, repost_count, reply_count,
         quote_count, bookmark_count, impression_count
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0)`,
    ).bind(post.uri, now, m.likeCount, m.repostCount, m.replyCount, m.quoteCount),
  ]

  for (const ref of refs) {
    statements.push(
      db.prepare(
        `INSERT INTO x_post_repos (post_id, owner, repo, match_kind)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (post_id, owner, repo) DO UPDATE SET match_kind = excluded.match_kind`,
      ).bind(post.uri, ref.owner, ref.repo, ref.matchKind),
    )
  }

  return statements
}

async function runInChunks(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += WRITE_CHUNK)
    await db.batch(statements.slice(i, i + WRITE_CHUNK))
}

export async function ingestBskyMentions(deps: BskyIngestDeps): Promise<BskyIngestSummary> {
  const startedAt = Date.now()
  const { db, client, now } = deps

  const summary: BskyIngestSummary = {
    postsRead: 0,
    postsUnparsable: 0,
    postsStored: 0,
    postsSkippedNoRepo: 0,
    postsUnique: 0,
    reposSeen: 0,
    ledgerInserted: 0,
    ledgerUpdated: 0,
    requestsMade: 0,
    truncatedQueries: [],
    failedQueries: [],
    authenticated: false,
    elapsedMs: 0,
  }

  const lookbackDays = deps.lookbackDays ?? LOOKBACK_DAYS
  const since = new Date((now - lookbackDays * 86_400) * 1000).toISOString()

  // Deduplicated across queries: the phrases overlap heavily by design, and a
  // post matching four of them is one post, not four.
  const collected = new Map<string, BskyPost>()

  for (const query of BSKY_DISCOVERY_QUERIES) {
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
      const result = await client.searchPosts({
        query,
        since,
        cursor,
        limit: BSKY_SEARCH_PAGE_SIZE,
      })

      if (result._tag === 'err') {
        // One failed query does not abandon the others: the phrases are
        // independent, and the posts the rest found are worth keeping.
        summary.failedQueries.push({ query, error: result.error._tag })
        break
      }

      summary.requestsMade += 1
      summary.postsRead += result.value.postsRead
      summary.postsUnparsable += result.value.unparsable
      for (const post of result.value.posts)
        collected.set(post.uri, post)

      cursor = result.value.cursor
      if (!cursor || result.value.posts.length === 0)
        break
      if (page === MAX_PAGES_PER_QUERY - 1)
        summary.truncatedQueries.push(query)
    }
  }

  summary.authenticated = client.isAuthenticated()
  summary.postsUnique = collected.size

  const repos = new Map<string, DiscoveredRepo>()
  const statements: D1PreparedStatement[] = []

  for (const post of collected.values()) {
    const refs = extractRepoReferences({ urls: post.urls, text: searchableText(post) })
    if (refs.length === 0) {
      // Matched a phrase but pointed at no repo we can act on. The bulk of
      // matches land here: only about 16% of Bluesky matches name a repo,
      // against a much higher rate on X, because the phrases catch a lot of
      // ordinary conversation about skills.
      summary.postsSkippedNoRepo += 1
      continue
    }

    summary.postsStored += 1
    statements.push(...postWriteStatements(db, post, refs, now))

    // Split the post's endorsement across everything it endorses, for the same
    // reason X does: a post naming one repo is a recommendation, a post naming
    // twenty is a list, and each entry carries a twentieth of the weight.
    const score = weighted(post) / refs.length
    for (const ref of refs) {
      const key = `${ref.owner}/${ref.repo}`
      const held = repos.get(key)
      if (!held || score > held.evidenceScore) {
        repos.set(key, {
          owner: ref.owner,
          repo: ref.repo,
          evidenceUrl: bskyPostUrl(post),
          evidenceText: searchableText(post),
          evidenceScore: score,
        })
      }
    }
  }

  await runInChunks(db, statements)

  summary.reposSeen = repos.size
  for (const repo of repos.values()) {
    const outcome = await upsertLedgerEntry({ db, source: 'bsky', repo, now })
    if (outcome === 'inserted') {
      summary.ledgerInserted += 1
      deps.onNewRepo?.(repo)
    }
    else {
      summary.ledgerUpdated += 1
    }
  }

  summary.elapsedMs = Date.now() - startedAt
  return summary
}
