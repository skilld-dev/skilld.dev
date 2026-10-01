/**
 * Rank individual skills by the two routes that can name one accurately.
 *
 *   SOCIAL   a post named the skill, matched against its repo's own skill
 *            vocabulary and stored in `x_post_skills`.
 *   GITHUB   the repository's stars surged AND it holds exactly one skill, so
 *            the surge cannot belong to any other.
 *
 * The single-skill rule is not a heuristic, it is the accuracy gate. A surge
 * on a twenty-skill repo names no skill at all, and inventing one would put
 * claims on the page that the data does not support. Those repos still rank as
 * repos; see `trending-repos.ts`.
 *
 * Scoring, weighting and the social-over-stars decision live in
 * `#shared/trending-skill-score`, which is pure. This module only loads.
 *
 * BEWARE THE SOCIAL FLOOR. Measured across the verified corpus, genuine
 * mentions carried 0, 1, 1, 3, 4 and 7 likes. Any floor above single digits
 * empties the social half of the page entirely, so `minLikes` is a real
 * product lever rather than a formality.
 */

import type { SkillTrendInput, SkillTrendScore } from '#shared/trending-skill-score'
import { canonicalRepoSkillPath } from '#shared/skill-routes'
import { rankSkillTrends } from '#shared/trending-skill-score'

export interface TrendingSkill extends SkillTrendScore {
  evidence: TrendingSkillEvidence | null
  /**
   * Posts about the skill by other authors, one each, beyond `evidence`.
   * Dedicated posts first, then by likes, at most {@link MAX_MORE_POSTS}.
   */
  morePosts: TrendingSkillEvidence[]
  /** Current stars on the skill's repository. Display only, never ranked. */
  stars: number | null
  /** The skill's own description, from its SKILL.md frontmatter. */
  description: string | null
  /** Current Skills in the repository, used to choose its canonical route. */
  repoSkillCount: number
  /** Final public route. Consumers must not reconstruct it from other fields. */
  registryPath: string
}

export interface TrendingSkillEvidence {
  postId: string
  url: string
  authorHandle: string
  /** Display name, stored at ingest. Null when the network sent none. */
  authorName: string | null
  /** Author profile image, stored at ingest. Null before the first read that carried one. */
  authorAvatar: string | null
  text: string
  postedAt: number
  favouriteCount: number
  /** Which network carried it, so the UI links to the right place. */
  platform: 'x' | 'bsky'
}

export interface LoadTrendingSkillsOptions {
  db: D1Database
  /** Unix seconds. */
  now: number
  /** How far back a mention or a surge still counts. Defaults to a week. */
  windowHours?: number
  limit?: number
  /** Likes a post needs before its mention counts at all. */
  minLikes?: number
  /** Keep these familiar repositories eligible, but place discoveries first. */
  deprioritizeRepositories?: ReadonlySet<string>
}

export const DEFAULT_WINDOW_HOURS = 24 * 7

/**
 * Posts a skill carries beyond its quoted one.
 *
 * The board shows them in a carousel, so every one costs payload on a page
 * that already ships thirty rows. Five more is enough to show a conversation
 * rather than one voice.
 */
export const MAX_MORE_POSTS = 5
/**
 * Deliberately low, and the reason has changed, so the number is worth
 * re-reading rather than inheriting.
 *
 * It used to say the verified corpus topped out at 7 likes. That was measured
 * while `skill-mention-verify` was silently dead from the ETag 304 bug fixed
 * in 034d553, so it described a starved sample rather than the ecosystem.
 *
 * Measured again on 2026-08-16 across 30 days: 121 verified mentions, ranging
 * from 0 to 911 likes, of which 70 carry zero. So this bar is not the
 * formality the old note implied. It drops 58% of verified mentions, and each
 * one it drops is a person who named a skill and got no reaction.
 *
 * Kept at 1 on purpose. Zero-like mentions are the cheapest thing to
 * manufacture, and `authorWeight` dilutes a listicle but cannot tell one quiet
 * human from one quiet script. Lowering this admits breadth and the astroturf
 * vector together, which is a product decision rather than a tuning one.
 *
 * It is applied per platform-appropriate metric, not to a raw number that
 * means different things on different networks: a Bluesky post with 3 likes is
 * doing better than an X post with 3.
 */
export const DEFAULT_MIN_LIKES = 1

interface MentionRow {
  owner: string
  repo: string
  slug: string
  canonical_name: string
  post_id: string
  platform: 'x' | 'bsky'
  author_handle: string
  author_name: string | null
  author_avatar: string | null
  author_id: string
  text_extract: string
  posted_at: number
  favourite_count: number
  repost_count: number
  reply_count: number
  quote_count: number
  bookmark_count: number
}

interface SurgeRow {
  owner: string
  repo: string
  slug: string
  canonical_name: string
  latest_gain: number
  baseline_gain: number
  stars: number
  observed_day: number
}

function skillKey(row: { owner: string, repo: string, slug: string }): string {
  return `${row.owner}/${row.repo}/${row.slug}`
}

/**
 * Permalink for the post that carried a mention.
 *
 * Bluesky post ids are AT-URIs, which are not URLs. The DID and record key are
 * pulled back out rather than stored twice.
 */
function postUrl(row: MentionRow): string {
  if (row.platform === 'bsky') {
    const rkey = row.post_id.split('/').pop() ?? ''
    return `https://bsky.app/profile/${row.author_id}/post/${rkey}`
  }
  return `https://x.com/${row.author_handle}/status/${row.post_id}`
}

function toEvidence(row: MentionRow): TrendingSkillEvidence {
  return {
    postId: row.post_id,
    url: postUrl(row),
    authorHandle: row.author_handle,
    authorName: row.author_name ?? null,
    authorAvatar: row.author_avatar ?? null,
    text: row.text_extract,
    postedAt: row.posted_at,
    favouriteCount: row.favourite_count,
    platform: row.platform,
  }
}

/**
 * Deduplicated per network: the same handle on X and Bluesky is two people as
 * far as this can tell, and treating them as one would punish an author for
 * cross-posting more than it would catch a manipulator.
 */
function authorKeyOf(row: MentionRow): string {
  return `${row.platform}:${row.author_handle.toLowerCase()}`
}

/**
 * Engagement on a scale that survives being compared across networks.
 *
 * Raw favourites cannot be summed across platforms: X routinely clears
 * thousands where Bluesky clears single digits, so a raw sum would make every
 * cross-network skill rank purely on how much of its evidence came from X.
 * Reposts and quotes are counted because they are the acts that carry a skill
 * to a new audience, on either network.
 */
function engagementOf(row: MentionRow): number {
  return row.favourite_count
    + row.repost_count * 3
    + row.reply_count
    + row.quote_count * 3
    + row.bookmark_count * 5
}

/**
 * Social mentions inside the window, grouped per skill.
 *
 * Ordered by engagement so the first row seen for a skill is the strongest one
 * to quote as evidence.
 *
 * `CROSS JOIN` fixes the join order: posts in the window first, then their
 * skills, then one primary-key check each. With a plain JOIN the planner
 * scanned all of `skills` first, about 18K rows per call against 1.2K.
 */
interface SocialEntry {
  input: SkillTrendInput
  evidence: TrendingSkillEvidence
  morePosts: TrendingSkillEvidence[]
}

async function loadSocialEvidence(
  options: LoadTrendingSkillsOptions,
  cutoff: number,
  minLikes: number,
): Promise<Map<string, SocialEntry>> {
  const rows = (await options.db
    .prepare(
      `SELECT s.owner, s.repo, s.slug, s.canonical_name,
              p.post_id, p.platform, p.author_handle, p.author_name, p.author_avatar, p.author_id, p.text_extract,
              p.posted_at, p.favourite_count, p.repost_count, p.reply_count,
              p.quote_count, p.bookmark_count
       FROM x_posts p
       CROSS JOIN x_post_skills s ON s.post_id = p.post_id
       CROSS JOIN skills current
         ON current.owner = s.owner
        AND current.repo = s.repo
        AND current.name = s.slug
        AND current.source_resolved = 1
       WHERE p.posted_at >= ?1
       ORDER BY p.favourite_count DESC`,
    )
    .bind(cutoff)
    .all<MentionRow>()).results ?? []

  // How many distinct skills each post named, which is what dilutes a listicle
  // down to its real weight. Counted across the whole window before any
  // grouping, because a post's breadth is a property of the post.
  const skillsPerPost = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = skillsPerPost.get(row.post_id) ?? new Set<string>()
    set.add(skillKey(row))
    skillsPerPost.set(row.post_id, set)
  }
  const breadthOf = (postId: string) => skillsPerPost.get(postId)?.size ?? 1

  const grouped = new Map<string, {
    input: SkillTrendInput
    evidence: TrendingSkillEvidence
    /** Narrowest post seen for this skill, which is the fairest thing to quote. */
    evidenceBreadth: number
    authors: Map<string, number>
    countedPosts: Set<string>
    /** Each author's narrowest post about the skill, for the posts beyond the quote. */
    postsByAuthor: Map<string, { post: TrendingSkillEvidence, breadth: number }>
  }>()

  for (const row of rows) {
    // Below the bar the mention does not exist, so it can neither lift a skill
    // onto the page nor add to its author count.
    if (row.favourite_count < minLikes)
      continue

    const key = skillKey(row)
    let entry = grouped.get(key)
    if (!entry) {
      entry = {
        input: {
          owner: row.owner,
          repo: row.repo,
          slug: row.slug,
          canonicalName: row.canonical_name,
          social: { authorCount: 0, authorWeight: 0, mentionCount: 0, engagement: 0, latestMentionAt: 0 },
          github: null,
        },
        evidence: toEvidence(row),
        evidenceBreadth: breadthOf(row.post_id),
        authors: new Map(),
        countedPosts: new Set(),
        postsByAuthor: new Map(),
      }
      grouped.set(key, entry)
    }

    // Quote the narrowest post available. Rows arrive engagement-first, so
    // without this a wide listicle can win the quote for many skills at once
    // and the page prints the same paragraph under each of them.
    const breadth = breadthOf(row.post_id)
    if (breadth < entry.evidenceBreadth) {
      entry.evidenceBreadth = breadth
      entry.evidence = toEvidence(row)
    }

    // Same rule per author: their narrowest post, and on a tie the one that
    // arrived first, which is the more liked.
    const authorKey = authorKeyOf(row)
    const held = entry.postsByAuthor.get(authorKey)
    if (!held || breadth < held.breadth)
      entry.postsByAuthor.set(authorKey, { post: toEvidence(row), breadth })

    if (entry.countedPosts.has(row.post_id))
      continue
    entry.countedPosts.add(row.post_id)

    const social = entry.input.social!
    social.mentionCount += 1
    social.engagement += engagementOf(row)
    social.latestMentionAt = Math.max(social.latestMentionAt, row.posted_at)
    // An author keeps their strongest contribution, so posting a listicle and
    // then a dedicated post counts as the dedicated one rather than summing.
    const contribution = 1 / breadth
    entry.authors.set(authorKey, Math.max(entry.authors.get(authorKey) ?? 0, contribution))
  }

  const out = new Map<string, SocialEntry>()
  for (const [key, entry] of grouped) {
    entry.input.social!.authorCount = entry.authors.size
    entry.input.social!.authorWeight = [...entry.authors.values()].reduce((a, b) => a + b, 0)
    // Everyone else who posted, dedicated posts before listicles. The sort is
    // stable, so equal breadths keep their arrival order, which is by likes.
    const quotedAuthor = `${entry.evidence.platform}:${entry.evidence.authorHandle.toLowerCase()}`
    const morePosts = [...entry.postsByAuthor]
      .filter(([author]) => author !== quotedAuthor)
      .map(([, held]) => held)
      .sort((a, b) => a.breadth - b.breadth)
      .slice(0, MAX_MORE_POSTS)
      .map(held => held.post)
    out.set(key, { input: entry.input, evidence: entry.evidence, morePosts })
  }
  return out
}

/**
 * Star surges on repositories holding exactly one skill.
 *
 * `HAVING COUNT(*) = 1` is the accuracy gate, and it is enforced in SQL so no
 * caller can forget it. A repo with two skills produces no row here at all.
 *
 * Skills are counted only for repositories that surged inside the window. The
 * count grouped all of `skills` before, about 15K rows per call against 4K.
 * `CROSS JOIN` keeps the surges as the outer loop.
 */
async function loadGithubEvidence(
  options: LoadTrendingSkillsOptions,
  cutoff: number,
): Promise<Map<string, SkillTrendInput>> {
  const rows = (await options.db
    .prepare(
      `WITH surged_repos AS (
         SELECT DISTINCT owner, repo
         FROM repo_star_surges
         WHERE detected_at >= ?1
       ),
       single_skill_repos AS (
         SELECT s.owner, s.repo, MIN(s.name) AS slug, MIN(s.display_name) AS display_name
         FROM surged_repos
         CROSS JOIN skills s ON s.owner = surged_repos.owner AND s.repo = surged_repos.repo
         WHERE s.source_resolved = 1
         GROUP BY s.owner, s.repo
         HAVING COUNT(*) = 1
       )
       SELECT r.owner, r.repo, r.slug,
              COALESCE(r.display_name, r.slug) AS canonical_name,
              g.latest_gain, g.baseline_gain, g.stars, g.observed_day
       FROM repo_star_surges g
       JOIN single_skill_repos r ON r.owner = g.owner AND r.repo = g.repo
       WHERE g.detected_at >= ?1
       ORDER BY g.observed_day DESC, g.latest_gain DESC`,
    )
    .bind(cutoff)
    .all<SurgeRow>()).results ?? []

  const out = new Map<string, SkillTrendInput>()
  for (const row of rows) {
    const key = skillKey(row)
    // Rows arrive newest first, so the first surge seen for a skill is the
    // current one. A multi-day surge must not stack into a bigger claim than
    // any single day of it supports.
    if (out.has(key))
      continue
    out.set(key, {
      owner: row.owner,
      repo: row.repo,
      slug: row.slug,
      canonicalName: row.canonical_name,
      social: null,
      github: {
        latestGain: row.latest_gain,
        baselineGain: row.baseline_gain,
        stars: row.stars,
        observedDay: row.observed_day,
      },
    })
  }
  return out
}

export async function loadTrendingSkills(
  options: LoadTrendingSkillsOptions,
): Promise<TrendingSkill[]> {
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS
  const minLikes = options.minLikes ?? DEFAULT_MIN_LIKES
  const limit = options.limit ?? 24
  const cutoff = options.now - windowHours * 3600

  const [social, github] = await Promise.all([
    loadSocialEvidence(options, cutoff, minLikes),
    loadGithubEvidence(options, cutoff),
  ])

  const merged = new Map<string, {
    input: SkillTrendInput
    evidence: TrendingSkillEvidence | null
    morePosts: TrendingSkillEvidence[]
  }>()

  for (const [key, entry] of social)
    merged.set(key, entry)

  for (const [key, input] of github) {
    const held = merged.get(key)
    if (held)
      held.input.github = input.github
    else
      merged.set(key, { input, evidence: null, morePosts: [] })
  }

  const deprioritized = options.deprioritizeRepositories ?? new Set<string>()
  const ranked = rankSkillTrends([...merged.values()].map(m => m.input))
    .sort((left, right) => Number(deprioritized.has(`${left.owner}/${left.repo}`)) - Number(deprioritized.has(`${right.owner}/${right.repo}`)))

  const page = ranked.slice(0, limit)
  const [stars, descriptions, repoSkillCounts] = await Promise.all([
    loadRepoStars(options.db, page),
    loadSkillDescriptions(options.db, page),
    loadRepoSkillCounts(options.db, page),
  ])

  return page.map((scored) => {
    const repoSkillCount = repoSkillCounts.get(`${scored.owner}/${scored.repo}`) ?? 0
    return {
      ...scored,
      evidence: merged.get(skillKey(scored))?.evidence ?? null,
      morePosts: merged.get(skillKey(scored))?.morePosts ?? [],
      stars: stars.get(`${scored.owner}/${scored.repo}`) ?? null,
      description: descriptions.get(skillKey(scored)) ?? null,
      repoSkillCount,
      registryPath: canonicalRepoSkillPath({
        owner: scored.owner,
        repo: scored.repo,
        name: scored.slug,
        repoSkillCount,
      }),
    }
  })
}

async function loadRepoSkillCounts(
  db: D1Database,
  entries: readonly { owner: string, repo: string }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const unique = [...new Map(entries.map(entry => [`${entry.owner}/${entry.repo}`, entry])).values()]
  const perQuery = 50

  for (let i = 0; i < unique.length; i += perQuery) {
    const chunk = unique.slice(i, i + perQuery)
    const placeholders = chunk.map((_, j) => `(?${j * 2 + 1}, ?${j * 2 + 2})`).join(', ')
    const rows = (await db
      .prepare(
        `SELECT owner, repo, COUNT(*) AS skill_count
         FROM skills
         WHERE source_resolved = 1
           AND (owner, repo) IN (VALUES ${placeholders})
         GROUP BY owner, repo`,
      )
      .bind(...chunk.flatMap(entry => [entry.owner, entry.repo]))
      .all<{ owner: string, repo: string, skill_count: number }>()).results ?? []
    for (const row of rows)
      out.set(`${row.owner}/${row.repo}`, row.skill_count)
  }

  return out
}

/**
 * The skill's own description, from its SKILL.md frontmatter.
 *
 * Carried because the post that named a skill is evidence, not explanation. A
 * real one from the window reads "🔥 4 OPEN-SOURCE AI TOOLS YOU CAN'T MISS THIS
 * MONTH…", which proves someone mentioned the skill and tells a reader nothing
 * about what it does. The author's own description does the second job.
 */
async function loadSkillDescriptions(
  db: D1Database,
  entries: readonly { owner: string, repo: string, slug: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (entries.length === 0)
    return out

  // Three bound parameters per skill against D1's ceiling of 100.
  const perQuery = 30
  for (let i = 0; i < entries.length; i += perQuery) {
    const chunk = entries.slice(i, i + perQuery)
    const placeholders = chunk.map((_, j) => `(?${j * 3 + 1}, ?${j * 3 + 2}, ?${j * 3 + 3})`).join(', ')
    const rows = (await db
      .prepare(
        `SELECT owner, repo, name, description FROM skills
         WHERE (owner, repo, name) IN (VALUES ${placeholders})
           AND description IS NOT NULL AND description != ''`,
      )
      .bind(...chunk.flatMap(e => [e.owner, e.repo, e.slug]))
      .all<{ owner: string, repo: string, name: string, description: string }>()).results ?? []
    for (const row of rows)
      out.set(`${row.owner}/${row.repo}/${row.name}`, row.description)
  }
  return out
}

/**
 * Current star count for each listed skill's repository.
 *
 * Carried because a name and a mention alone give a reader nothing to weigh
 * authority against, and stars are the one popularity signal VISION sanctions.
 * Loaded for the ranked page only, never for the whole candidate set, so the
 * cost is bounded by `limit` rather than by how much the world posted.
 *
 * Never feeds the ranking. It is displayed context, and letting it rank would
 * make this board a second star leaderboard, which the board's `all` range
 * already is.
 */
async function loadRepoStars(
  db: D1Database,
  entries: readonly { owner: string, repo: string }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (entries.length === 0)
    return out

  // D1 rejects more than 100 bound parameters and each repo costs two, so the
  // lookup is chunked rather than assuming the page fits.
  const perQuery = 50
  for (let i = 0; i < entries.length; i += perQuery) {
    const chunk = entries.slice(i, i + perQuery)
    const placeholders = chunk.map((_, j) => `(?${j * 2 + 1}, ?${j * 2 + 2})`).join(', ')
    const rows = (await db
      .prepare(
        `SELECT owner, repo, stars FROM repos
         WHERE (owner, repo) IN (VALUES ${placeholders})`,
      )
      .bind(...chunk.flatMap(e => [e.owner, e.repo]))
      .all<{ owner: string, repo: string, stars: number }>()).results ?? []
    for (const row of rows)
      out.set(`${row.owner}/${row.repo}`, row.stars)
  }
  return out
}
