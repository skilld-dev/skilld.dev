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
import { rankSkillTrends } from '#shared/trending-skill-score'

export interface TrendingSkill extends SkillTrendScore {
  evidence: TrendingSkillEvidence | null
  /** Current stars on the skill's repository. Display only, never ranked. */
  stars: number | null
}

export interface TrendingSkillEvidence {
  postId: string
  url: string
  authorHandle: string
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
 * Deliberately low. The verified corpus tops out at 7 likes, so a bar of 25
 * would return an empty page; this admits anything with a pulse and leaves the
 * tuning visible rather than buried.
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
 */
async function loadSocialEvidence(
  options: LoadTrendingSkillsOptions,
  cutoff: number,
  minLikes: number,
): Promise<Map<string, { input: SkillTrendInput, evidence: TrendingSkillEvidence }>> {
  const rows = (await options.db
    .prepare(
      `SELECT s.owner, s.repo, s.slug, s.canonical_name,
              p.post_id, p.platform, p.author_handle, p.author_id, p.text_extract,
              p.posted_at, p.favourite_count, p.repost_count, p.reply_count,
              p.quote_count, p.bookmark_count
       FROM x_post_skills s
       JOIN x_posts p ON p.post_id = s.post_id
       WHERE p.posted_at >= ?1
       ORDER BY p.favourite_count DESC`,
    )
    .bind(cutoff)
    .all<MentionRow>()).results ?? []

  const grouped = new Map<string, {
    input: SkillTrendInput
    evidence: TrendingSkillEvidence
    authors: Set<string>
    countedPosts: Set<string>
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
          social: { authorCount: 0, mentionCount: 0, engagement: 0, latestMentionAt: 0 },
          github: null,
        },
        evidence: {
          postId: row.post_id,
          url: postUrl(row),
          authorHandle: row.author_handle,
          text: row.text_extract,
          postedAt: row.posted_at,
          favouriteCount: row.favourite_count,
          platform: row.platform,
        },
        authors: new Set(),
        countedPosts: new Set(),
      }
      grouped.set(key, entry)
    }

    if (entry.countedPosts.has(row.post_id))
      continue
    entry.countedPosts.add(row.post_id)

    const social = entry.input.social!
    social.mentionCount += 1
    social.engagement += engagementOf(row)
    social.latestMentionAt = Math.max(social.latestMentionAt, row.posted_at)
    // Deduplicated per network: the same handle on X and Bluesky is two
    // people as far as this can tell, and treating them as one would punish
    // an author for cross-posting more than it would catch a manipulator.
    entry.authors.add(`${row.platform}:${row.author_handle.toLowerCase()}`)
  }

  const out = new Map<string, { input: SkillTrendInput, evidence: TrendingSkillEvidence }>()
  for (const [key, entry] of grouped) {
    entry.input.social!.authorCount = entry.authors.size
    out.set(key, { input: entry.input, evidence: entry.evidence })
  }
  return out
}

/**
 * Star surges on repositories holding exactly one skill.
 *
 * `HAVING COUNT(*) = 1` is the accuracy gate, and it is enforced in SQL so no
 * caller can forget it. A repo with two skills produces no row here at all.
 */
async function loadGithubEvidence(
  options: LoadTrendingSkillsOptions,
  cutoff: number,
): Promise<Map<string, SkillTrendInput>> {
  const rows = (await options.db
    .prepare(
      `WITH single_skill_repos AS (
         SELECT owner, repo, MIN(name) AS slug, MIN(display_name) AS display_name
         FROM skills
         WHERE source_resolved = 1
         GROUP BY owner, repo
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

  const merged = new Map<string, { input: SkillTrendInput, evidence: TrendingSkillEvidence | null }>()

  for (const [key, entry] of social)
    merged.set(key, { input: entry.input, evidence: entry.evidence })

  for (const [key, input] of github) {
    const held = merged.get(key)
    if (held)
      held.input.github = input.github
    else
      merged.set(key, { input, evidence: null })
  }

  const deprioritized = options.deprioritizeRepositories ?? new Set<string>()
  const ranked = rankSkillTrends([...merged.values()].map(m => m.input))
    .sort((left, right) => Number(deprioritized.has(`${left.owner}/${left.repo}`)) - Number(deprioritized.has(`${right.owner}/${right.repo}`)))

  const page = ranked.slice(0, limit)
  const stars = await loadRepoStars(options.db, page)

  return page.map(scored => ({
    ...scored,
    evidence: merged.get(skillKey(scored))?.evidence ?? null,
    stars: stars.get(`${scored.owner}/${scored.repo}`) ?? null,
  }))
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
 * make this board a second star leaderboard, which `/skills/leaderboard`
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
