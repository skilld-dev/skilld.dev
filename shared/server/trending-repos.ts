/**
 * Read side: turn stored posts and their snapshots into a ranked list of
 * trending repos, joined to whatever the registry already knows about them.
 *
 * The ranking itself lives in `#shared/trending-score` as a pure function.
 * This module only loads rows and hands them over, so the ordering can be
 * reasoned about and tested without a database.
 */

import type { RepoTrendInput, RepoTrendScore, TrendingWeights } from '#shared/trending-score'
import { cleanEvidenceText } from '#shared/evidence-text'
import { DEFAULT_TRENDING_WEIGHTS, rankRepoTrends } from '#shared/trending-score'

/**
 * Only posts inside this window can contribute. It bounds the query, and it
 * matches the score's own max age: older posts already score zero, so loading
 * them would cost a wider scan to reach the same answer.
 */
const TREND_WINDOW_HOURS = 24 * 14

export interface TrendingRepo extends RepoTrendScore {
  /** Skills the registry has indexed for this repo, empty if not indexed yet. */
  skills: TrendingRepoSkill[]
  stars: number | null
  repoDescription: string | null
  /** The post quoted as evidence on the page. */
  evidence: TrendingEvidence | null
  /** Ledger state, so an un-reviewed repo can be marked or held back. */
  ledgerStatus: string | null
}

export interface TrendingRepoSkill {
  name: string
  displayName: string | null
  slug: string
  description: string | null
}

export interface TrendingEvidence {
  postId: string
  url: string
  authorHandle: string
  authorName: string | null
  text: string
  postedAt: number
  favouriteCount: number
  bookmarkCount: number
  repostCount: number
}

interface PostRow {
  post_id: string
  owner: string
  repo: string
  author_id: string
  author_handle: string
  author_name: string | null
  posted_at: number
  text_extract: string
  favourite_count: number
  repost_count: number
  reply_count: number
  quote_count: number
  bookmark_count: number
  lang: string | null
  metrics_updated_at: number
  repo_count: number
  prev_observed_at: number | null
  prev_favourite_count: number | null
  prev_repost_count: number | null
  prev_reply_count: number | null
  prev_quote_count: number | null
  prev_bookmark_count: number | null
}

/**
 * Load contributing posts with the snapshot immediately before their latest.
 *
 * The correlated subqueries pick the newest snapshot strictly older than the
 * post's current `metrics_updated_at`. That pair is what makes the score a
 * velocity rather than a total; without it every post falls back to cold-start
 * scoring and a stale hit outranks a live one.
 */
const POSTS_SQL = `
  SELECT
    p.post_id, r.owner, r.repo, p.author_id, p.author_handle, p.author_name,
    p.posted_at, p.text_extract, p.lang,
    p.favourite_count, p.repost_count, p.reply_count, p.quote_count,
    p.bookmark_count, p.metrics_updated_at,
    (SELECT COUNT(*) FROM x_post_repos c WHERE c.post_id = p.post_id) AS repo_count,
    prev.observed_at      AS prev_observed_at,
    prev.favourite_count  AS prev_favourite_count,
    prev.repost_count     AS prev_repost_count,
    prev.reply_count      AS prev_reply_count,
    prev.quote_count      AS prev_quote_count,
    prev.bookmark_count   AS prev_bookmark_count
  FROM x_posts p
  JOIN x_post_repos r ON r.post_id = p.post_id
  LEFT JOIN x_post_metrics prev
    ON prev.post_id = p.post_id
   AND prev.observed_at = (
     SELECT MAX(m.observed_at) FROM x_post_metrics m
     WHERE m.post_id = p.post_id AND m.observed_at < p.metrics_updated_at
   )
  WHERE p.posted_at >= ?1
`

export interface LoadTrendingOptions {
  db: D1Database
  /** Unix seconds. */
  now: number
  limit?: number
  weights?: TrendingWeights
  /**
   * When true, repos with no indexed skills are dropped. The public page uses
   * this so a repo that turned out to hold nothing never reaches a crawler;
   * the admin review list leaves it false to see everything discovery found.
   */
  indexedOnly?: boolean
  /**
   * Likes a post needs before its mention counts. Measured on real data, the
   * posts worth surfacing carry hundreds: `cathrynlavery/diagram-design` came
   * from a 535-like post, `aashaexo/soundshuman` from 436. Below about 25 the
   * page fills with posts nobody engaged with.
   */
  minLikes?: number
  /**
   * Repos a single post may name before it counts as a listicle. A "30 GitHub
   * repos you should know" thread is not 30 endorsements, and its entries were
   * measured at 30.6% SKILL.md precision against 83.9% for focused posts.
   */
  maxReposPerPost?: number
}

export const DEFAULT_MIN_LIKES = 25
export const DEFAULT_MAX_REPOS_PER_POST = 3

export async function loadTrendingRepos(options: LoadTrendingOptions): Promise<TrendingRepo[]> {
  const { db, now } = options
  const limit = options.limit ?? 24
  const cutoff = now - TREND_WINDOW_HOURS * 3600

  const rows = (await db.prepare(POSTS_SQL).bind(cutoff).all<PostRow>()).results ?? []
  if (rows.length === 0)
    return []

  const grouped = new Map<string, RepoTrendInput>()
  const postsById = new Map<string, PostRow>()

  const minLikes = options.minLikes ?? 0
  const maxReposPerPost = options.maxReposPerPost ?? Infinity

  for (const row of rows) {
    // Quiet posts and listicles are excluded before ranking, so they cannot
    // contribute breadth or engagement to a repo.
    if (row.favourite_count < minLikes)
      continue
    if (row.repo_count > maxReposPerPost)
      continue
    postsById.set(row.post_id, row)
    const key = `${row.owner}/${row.repo}`
    let entry = grouped.get(key)
    if (!entry) {
      entry = { owner: row.owner, repo: row.repo, posts: [] }
      grouped.set(key, entry)
    }
    entry.posts.push({
      postId: row.post_id,
      authorId: row.author_id,
      postedAt: row.posted_at,
      observedAt: row.metrics_updated_at,
      repoCount: row.repo_count,
      current: {
        favouriteCount: row.favourite_count,
        repostCount: row.repost_count,
        replyCount: row.reply_count,
        quoteCount: row.quote_count,
        bookmarkCount: row.bookmark_count,
      },
      previous: row.prev_observed_at === null
        ? null
        : {
            observedAt: row.prev_observed_at,
            favouriteCount: row.prev_favourite_count ?? 0,
            repostCount: row.prev_repost_count ?? 0,
            replyCount: row.prev_reply_count ?? 0,
            quoteCount: row.prev_quote_count ?? 0,
            bookmarkCount: row.prev_bookmark_count ?? 0,
          },
    })
  }

  const ranked = rankRepoTrends(
    [...grouped.values()],
    now,
    options.weights ?? DEFAULT_TRENDING_WEIGHTS,
  )

  // Filter first, then take the page. An earlier version over-fetched
  // `limit * 4` candidates and filtered afterwards, which silently returned a
  // short page whenever the indexed rate was lower than the multiplier assumed.
  // In production that meant the homepage asked for 6 and rendered 2, dropping
  // below its own display threshold so the section never appeared at all, while
  // the same data served 7 at limit 24. A guessed multiplier cannot be correct
  // for an indexed rate that moves; an exact membership check can.
  const eligible = options.indexedOnly
    ? await filterToIndexed(db, ranked)
    : ranked

  const candidates = eligible.slice(0, limit)
  if (candidates.length === 0)
    return []

  const [skillsByRepo, repoMeta, ledgerByRepo] = await Promise.all([
    loadSkills(db, candidates),
    loadRepoMeta(db, candidates),
    loadLedger(db, candidates),
  ])

  // Evidence is assigned in rank order and never reused.
  //
  // One thread naming several repos contributes to all of them, so the naive
  // "quote each repo's best post" put the identical wall of text on the page
  // twice in a live review. Walking rank order and skipping spent posts gives
  // the strongest repo the strongest quote and everyone else something new.
  const usedPostIds = new Set<string>()

  const enriched: TrendingRepo[] = candidates.map((entry) => {
    const key = `${entry.owner}/${entry.repo}`
    const evidenceRow = pickEvidence(entry.contributingPostIds, postsById, usedPostIds)
    if (evidenceRow)
      usedPostIds.add(evidenceRow.post_id)
    return {
      ...entry,
      skills: skillsByRepo.get(key) ?? [],
      stars: repoMeta.get(key)?.stars ?? null,
      repoDescription: repoMeta.get(key)?.description ?? null,
      ledgerStatus: ledgerByRepo.get(key) ?? null,
      evidence: evidenceRow
        ? {
            postId: evidenceRow.post_id,
            url: `https://x.com/${evidenceRow.author_handle}/status/${evidenceRow.post_id}`,
            authorHandle: evidenceRow.author_handle,
            authorName: evidenceRow.author_name,
            text: cleanEvidenceText(evidenceRow.text_extract),
            postedAt: evidenceRow.posted_at,
            favouriteCount: evidenceRow.favourite_count,
            bookmarkCount: evidenceRow.bookmark_count,
            repostCount: evidenceRow.repost_count,
          }
        : null,
    }
  })

  return enriched
}

/**
 * Keep only repos the registry has resolved at least one skill for, in rank
 * order.
 *
 * A cheap existence check across every ranked candidate, chunked to stay inside
 * D1's 100-parameter ceiling. Two queries at present volume. The expensive
 * enrichment then runs against the handful of repos that actually make the
 * page, rather than against a speculative over-fetch.
 */
async function filterToIndexed(
  db: D1Database,
  ranked: RepoTrendScore[],
): Promise<RepoTrendScore[]> {
  if (ranked.length === 0)
    return []

  const indexed = new Set<string>()
  const pages = await Promise.all(chunkRepos(ranked).map(chunk => db
    .prepare(
      `SELECT DISTINCT owner, repo
       FROM skills
       WHERE (owner, repo) IN (VALUES ${repoPlaceholders(chunk.length)})
         AND source_resolved = 1`,
    )
    .bind(...repoParams(chunk))
    .all<{ owner: string, repo: string }>()))

  for (const page of pages) {
    for (const row of page.results ?? [])
      indexed.add(`${row.owner}/${row.repo}`)
  }

  return ranked.filter(entry => indexed.has(`${entry.owner}/${entry.repo}`))
}

/**
 * Choose the post to quote for one repo.
 *
 * Two preferences, in order. First an unused post, so the same thread is not
 * quoted against several repos. Then, among unused posts, an English one when
 * the repo has any: the page is written in English and targets English
 * queries, and leading with a wall of text a reader cannot parse buries the
 * claim the quote exists to support. This is a display choice only; ranking
 * has already happened and is not language-aware.
 *
 * Falls back to the repo's best post when every candidate is already spent,
 * because a repeated quote still beats no evidence at all.
 */
function pickEvidence(
  contributingPostIds: string[],
  postsById: Map<string, PostRow>,
  usedPostIds: Set<string>,
): PostRow | undefined {
  const available = contributingPostIds
    .map(id => postsById.get(id))
    .filter((row): row is PostRow => row !== undefined)

  const unused = available.filter(row => !usedPostIds.has(row.post_id))
  if (unused.length === 0)
    return available[0]

  return unused.find(row => row.lang === 'en') ?? unused[0]
}

/**
 * Repos per lookup query.
 *
 * D1 rejects a statement with more than 100 bound parameters, and each repo
 * costs two (owner and repo). Fifty is therefore the ceiling, not a tuning
 * choice. The over-fetch that feeds the indexed filter asks for `limit * 4`
 * candidates, which reached 96 repos and 192 parameters, so these lookups have
 * to be chunked rather than sent whole.
 */
const REPOS_PER_LOOKUP = 50

function repoPlaceholders(count: number, offset = 0): string {
  return Array.from({ length: count }, (_, i) => `(?${offset + i * 2 + 1}, ?${offset + i * 2 + 2})`).join(', ')
}

function repoParams(entries: Array<{ owner: string, repo: string }>): string[] {
  return entries.flatMap(e => [e.owner, e.repo])
}

function chunkRepos<T extends { owner: string, repo: string }>(entries: T[]): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < entries.length; i += REPOS_PER_LOOKUP)
    chunks.push(entries.slice(i, i + REPOS_PER_LOOKUP))
  return chunks
}

async function loadSkills(
  db: D1Database,
  entries: Array<{ owner: string, repo: string }>,
): Promise<Map<string, TrendingRepoSkill[]>> {
  interface SkillRow {
    owner: string
    repo: string
    name: string
    display_name: string | null
    slug: string
    description: string | null
  }

  const pages = await Promise.all(chunkRepos(entries).map(chunk => db
    .prepare(
      `SELECT owner, repo, name, display_name, slug, description
       FROM skills
       WHERE (owner, repo) IN (VALUES ${repoPlaceholders(chunk.length)})
         AND source_resolved = 1
       ORDER BY owner, repo, name`,
    )
    .bind(...repoParams(chunk))
    .all<SkillRow>()))
  const rows = pages.flatMap(page => page.results ?? [])

  const out = new Map<string, TrendingRepoSkill[]>()
  for (const row of rows) {
    const key = `${row.owner}/${row.repo}`
    const list = out.get(key) ?? []
    list.push({
      name: row.name,
      displayName: row.display_name,
      slug: row.slug,
      description: row.description,
    })
    out.set(key, list)
  }
  return out
}

async function loadRepoMeta(
  db: D1Database,
  entries: Array<{ owner: string, repo: string }>,
): Promise<Map<string, { stars: number | null, description: string | null }>> {
  const pages = await Promise.all(chunkRepos(entries).map(chunk => db
    .prepare(
      `SELECT owner, repo, stars, description
       FROM repos
       WHERE (owner, repo) IN (VALUES ${repoPlaceholders(chunk.length)})`,
    )
    .bind(...repoParams(chunk))
    .all<{ owner: string, repo: string, stars: number | null, description: string | null }>()))
  const rows = pages.flatMap(page => page.results ?? [])

  return new Map(rows.map(r => [`${r.owner}/${r.repo}`, { stars: r.stars, description: r.description }]))
}

async function loadLedger(
  db: D1Database,
  entries: Array<{ owner: string, repo: string }>,
): Promise<Map<string, string>> {
  const pages = await Promise.all(chunkRepos(entries).map(chunk => db
    .prepare(
      `SELECT owner, repo, status
       FROM discovery_ledger
       WHERE (owner, repo) IN (VALUES ${repoPlaceholders(chunk.length)})`,
    )
    .bind(...repoParams(chunk))
    .all<{ owner: string, repo: string, status: string }>()))
  const rows = pages.flatMap(page => page.results ?? [])

  return new Map(rows.map(r => [`${r.owner}/${r.repo}`, r.status]))
}
