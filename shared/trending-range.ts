/**
 * The three boards `/skills/trending` can show, and what each one may claim.
 *
 * Two of them are the same board over different windows. The third is a
 * different question entirely: `all` ranks reviewed repositories by GitHub
 * stars, which is what `/skills/leaderboard` used to answer on its own page.
 * That page was merged into this one on 2026-08-15, so its keyword target
 * moves here verbatim rather than disappearing.
 *
 * Pure and kept out of the component, so the title, the canonical URL and the
 * window each range asks the API for are all testable without rendering.
 * Copy lives here for the same reason: a description that overclaims is a
 * defect, and a defect wants a test.
 */

import { relativeDay } from './trending-post'

export type TrendingRange = 'week' | 'month' | 'all'

/**
 * Rows the `week` and `month` boards show at most.
 *
 * Thirty is enough to read as a leaderboard rather than a shortlist. Shared
 * because the SEO admission job must count exactly the rows a reader can see.
 */
export const TRENDING_BOARD_LIMIT = 30

/**
 * Evidenced rows a board needs before it asks to be indexed. Below this the
 * page is noindex, and the sitemap must not list it. Shared for that reason.
 */
export const MIN_INDEXABLE_ROWS = 8

/**
 * Repositories the `week` and `month` boards move below every other row, the
 * most-starred first. They stay eligible, so new finds lead the board.
 *
 * Shared because the board header states this rule, and the number in the
 * header must be the number the ranking reads. Track pages skip the demotion
 * (ADR-0010), so their header never states it.
 */
export const DEMOTED_STARRED_REPOSITORIES = 20

/**
 * The range a bare `/skills/trending` serves.
 *
 * A month, not a week. A week of social evidence routinely returns fewer than
 * eight named skills, which is the bar the page sets for its own indexability,
 * so the shorter window made the default board excuse itself from the index.
 */
export const DEFAULT_TRENDING_RANGE: TrendingRange = 'month'

const SITE_ORIGIN = 'https://skilld.dev'

/**
 * The category noun, held on one line.
 *
 * The space is U+00A0. The heading sets `text-wrap: balance`, which balances
 * line lengths without regard for where a phrase ends: at phone width it broke
 * "Trending agent / skills, August 2026" across the noun itself. The
 * non-breaking space moves the break to the comma. Measured against the
 * rendered heading, not assumed.
 */
export const SKILLS_NOUN = 'agent\u00A0skills'

export interface TrendingRangeMeta {
  readonly id: TrendingRange
  /** Switcher label. Short verb-free noun, per the UI chrome register. */
  readonly label: string
  /** The line under the label in the sidebar: what the range covers. */
  readonly hint: string
  /**
   * Hours of history the feed endpoint is asked for, or null for `all`, which
   * reads a different endpoint and has no window at all.
   *
   * `/api/feed/trending` clamps this to 30 days, so 720 is the ceiling.
   */
  readonly windowHours: number | null
  /** Days the board covers, for the dated range line. Null for `all`. */
  readonly windowDays: number | null
  /** Where the switcher link points. The default range carries no query. */
  readonly path: string
  /** Self-referencing canonical, so no range points at another. */
  readonly canonical: string
  /**
   * The `<title>` stem, which is also the keyword target for the range.
   *
   * A stem, not the finished title: `trendingRangeTitle` stamps the month onto
   * the ranges that cover a live window. Write it so a `, August 2026` reads
   * on the end of it.
   */
  readonly title: string
  /**
   * The `<h1>`. Shorter than the title; the page already states its subject.
   * What the month range shows when it cannot date itself; see
   * `trendingRangeHeading`.
   */
  readonly heading: string
  /** The label above the board. */
  readonly sectionLabel: string
}

export const TRENDING_RANGES: readonly TrendingRangeMeta[] = [
  {
    id: 'week',
    label: 'Week',
    hint: 'Last 7 days',
    windowHours: 24 * 7,
    windowDays: 7,
    path: '/skills/trending?range=week',
    canonical: `${SITE_ORIGIN}/skills/trending?range=week`,
    title: 'Trending Agent Skills This Week',
    heading: `Trending ${SKILLS_NOUN} this week`,
    sectionLabel: 'Top skills',
  },
  {
    id: 'month',
    label: 'Month',
    hint: 'Last 30 days',
    windowHours: 24 * 30,
    windowDays: 30,
    path: '/skills/trending',
    canonical: `${SITE_ORIGIN}/skills/trending`,
    title: 'Trending Agent Skills',
    heading: `Trending ${SKILLS_NOUN} this month`,
    sectionLabel: 'Top skills',
  },
  {
    // Inherited from `/skills/leaderboard`, which this range replaced. The
    // title carried a ~4,100/mo `claude skills *` cluster across word for word,
    // and then drew nothing: 0 impressions over the 28 days to 2026-08-26. The
    // noun is now "Agent Skill", matching the heading and the rest of the site.
    id: 'all',
    label: 'All time',
    hint: 'By GitHub stars',
    windowHours: null,
    windowDays: null,
    path: '/skills/trending?range=all',
    canonical: `${SITE_ORIGIN}/skills/trending?range=all`,
    title: 'Top Agent Skill Repositories on GitHub',
    heading: 'Top skill repositories',
    sectionLabel: 'Top repositories',
  },
]

const RANGE_BY_ID = new Map(TRENDING_RANGES.map(range => [range.id, range]))

/**
 * The `<title>`, month-stamped for the ranges that cover a live window.
 *
 * The SERP for this topic is dated listicles ("... in 2026"), so an undated
 * title competes against dated ones for the same click. The stamp is the month
 * the board was computed in, which is what a reader is deciding about when they
 * choose a result.
 *
 * `all` is exempt on purpose. It ranks by lifetime stars, so a month on it
 * would be a false claim, and its stem carries the repository cluster it
 * inherited from `/skills/leaderboard`.
 *
 * Read off `clockSeconds`, never `Date.now()`. That clock travels with the feed
 * payload, so the server and the browser stamp the same month; a locally
 * computed one is the hydration mismatch already documented on the page. Zero
 * means the fetch failed, and a board that did not load dates nothing.
 */
/**
 * The `<h1>`, stamped to match the `<title>`.
 *
 * Not cosmetic. Google rewrites a dated title when nothing on the page backs
 * the date up, and an undated `<h1>` is the first thing it reaches for as the
 * replacement. Stamping the heading is what lets the dated title survive.
 *
 * Only the month range takes the stamp. Its stem is a fragment written to be
 * completed ("Trending in August 2026"); the week range already names its own
 * window, and the all-time range has none.
 */
export function trendingRangeHeading(range: TrendingRange, clockSeconds: number): string {
  const meta = trendingRangeMeta(range)
  if (range !== 'month')
    return meta.heading
  const stamp = monthStamp(clockSeconds)
  // Comma, not "in": it matches the `<title>`, and it gives the two-line
  // heading a clause to break on. See `SKILLS_NOUN`.
  return stamp ? `Trending ${SKILLS_NOUN}, ${stamp}` : meta.heading
}

/**
 * The month a board was computed in, or null when it did not load.
 *
 * Off the payload clock, never `Date.now()`. That clock travels with the feed
 * response, so the server and the browser stamp the same month; a locally
 * computed one is the hydration mismatch already documented on the page.
 */
export function monthStamp(clockSeconds: number): string | null {
  if (!clockSeconds)
    return null
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(clockSeconds * 1000)
}

export function trendingRangeTitle(range: TrendingRange, clockSeconds: number): string {
  const meta = trendingRangeMeta(range)
  const stamp = monthStamp(clockSeconds)
  if (meta.windowDays === null || !stamp)
    return meta.title
  return `${meta.title}, ${stamp}`
}

/**
 * Parse `?range=` once, at the boundary, into a value the page can trust.
 *
 * Anything unrecognised is the default rather than an error. The query string
 * is reader-supplied and a stale bookmark is not a fault worth a 404; the
 * canonical then points the crawler at whichever board it actually got.
 */
export function resolveTrendingRange(value: unknown): TrendingRange {
  const candidate = Array.isArray(value) ? value[0] : value
  if (typeof candidate === 'string' && RANGE_BY_ID.has(candidate as TrendingRange))
    return candidate as TrendingRange
  return DEFAULT_TRENDING_RANGE
}

export type TrendingPage
  = | { _tag: 'ok', page: number, canonical: string }
    | { _tag: 'out-of-range', page: number }

/**
 * Decide what a `?page=` value means for a board.
 *
 * Page 1 canonicalises to the bare range URL. A page from 2 to the real page
 * count carries its own canonical. Anything past the last real page is
 * `out-of-range`, and the page answers 404: a page that has no rows must not
 * become an indexable copy of the board. 404 rather than a canonical to the
 * last page, because the old `/skills/leaderboard?page=N` redirects land here
 * and a 404 is the honest answer for a page that no longer exists.
 */
export function resolveTrendingPage(canonical: string, page: number, pageCount: number): TrendingPage {
  if (page <= 1)
    return { _tag: 'ok', page: 1, canonical }
  if (page > pageCount)
    return { _tag: 'out-of-range', page }
  return { _tag: 'ok', page, canonical: `${canonical}${canonical.includes('?') ? '&' : '?'}page=${page}` }
}

export function trendingRangeMeta(range: TrendingRange): TrendingRangeMeta {
  return RANGE_BY_ID.get(range) ?? RANGE_BY_ID.get(DEFAULT_TRENDING_RANGE)!
}

/**
 * The meta description, written from what the board actually holds.
 *
 * `all` states its eligibility rule and its ranking, because both are checkable
 * and neither is implied by the word "top". The feed ranges interpolate a count
 * only when there is one, after a version that served "0 skill repositories
 * developers are posting about right now".
 */
export function trendingRangeDescription(range: TrendingRange, evidencedCount: number): string {
  if (range === 'all') {
    return 'Skill repositories from individual GitHub creators, reviewed for eligibility and ranked by current GitHub stars. Works with Claude Code, Cursor, and Codex; every repository links to the source you install from.'
  }
  const period = range === 'week' ? 'this week' : 'this month'
  if (evidencedCount > 0) {
    return `${evidencedCount} agent skills devs are talking about ${period}, each shown with the evidence behind it: the post about it, or the star surge on a repo holding one skill.`
  }
  return 'Agent skills devs are talking about, ranked by how many separate devs share them rather than by how loud any one post was.'
}

/** One repository's exact star total on one UTC day. */
export interface StarPoint {
  /** UTC midnight, unix seconds. */
  day: number
  stars: number
}

/**
 * The post that put a row on the board, in the author's own words.
 *
 * One value rather than seven nullable fields on the row. A row either shows
 * a post, with every part of it, or shows none; half a post is not a state
 * the template has to handle.
 */
export interface TrendingPost {
  url: string
  /** What the person actually said. The claim in their words, not ours. */
  text: string
  /** Which network carried it, so the card can show that network's mark. */
  platform: 'x' | 'bsky'
  handle: string
  /** Display name, when the read that captured the post carried one. */
  authorName: string | null
  /** The speaker's profile image, when the read that captured the post carried one. */
  authorAvatar: string | null
  /** Likes on this post. Zero means it landed quietly, not unknown. */
  likes: number
  /** Age against the board's clock, never the browser's. */
  when: string
}

/**
 * The fields a board card reads off one stored post.
 *
 * Structural, like {@link LeaderboardRowInput}, so the trending feed and a
 * track board map their posts through one function without this module
 * importing either server route.
 */
export interface BoardPostInput {
  url: string
  text: string
  platform: 'x' | 'bsky'
  authorHandle: string
  /** Optional until every cached feed response carries it. */
  authorName?: string | null
  authorAvatar: string | null
  favouriteCount: number
  postedAt: number
}

/** One stored post, dated against the board's clock rather than the browser's. */
export function boardPost(post: BoardPostInput, clockSeconds: number): TrendingPost {
  return {
    url: post.url,
    text: post.text,
    platform: post.platform,
    handle: post.authorHandle,
    authorName: post.authorName ?? null,
    authorAvatar: post.authorAvatar,
    likes: post.favouriteCount,
    when: relativeDay(post.postedAt, clockSeconds),
  }
}

/**
 * Why a row is on the board. Exactly one reason per row.
 *
 * A tagged value rather than a basis string, because each reason renders
 * differently and one of them, `filler`, must never pass for the others. The
 * star gain is not a reason of its own on a social row: the sparkline beside
 * the star count carries it.
 */
export type TrendingReason
  = | {
    _tag: 'posts'
    posts: readonly TrendingPost[]
    /**
     * Counted mentions per rolling day across the last seven, oldest first,
     * for the braille spark. Null when the feed did not carry them.
     */
    mentionsByDay: readonly number[] | null
  }
  | { _tag: 'surge', gain: number, when: string | null }
  | { _tag: 'filler' }
  | { _tag: 'reviewed', skillCount: number, updated: string | null }
  /**
   * A track member, in a section whose heading states the order. The row
   * repeats nothing the heading already says.
   */
  | { _tag: 'member' }

/**
 * A board row, in the one shape the template renders.
 *
 * Both sources map into this rather than the template branching per range. A
 * template that branched would drift, and the two boards make different claims
 * that each have to survive being rendered by the same markup.
 */
export interface TrendingBoardRow {
  key: string
  /** Whose avatar the row shows. */
  owner: string
  /** The Repository the row's Skill lives in. */
  repo: string
  /** The Skill directory name the row links to, the last segment of `owner/repo/name`. */
  name: string
  /** The row's primary link text. */
  title: string
  /** Where the primary link goes. */
  to: string
  /** Secondary identifier beside the title. Null when the title already is it. */
  subtitle: string | null
  description: string | null
  stars: number | null
  /** Daily star totals across the board's window, oldest first. Empty when unmeasured. */
  starSeries: readonly StarPoint[]
  /** Names the Skill answers to, so a post can mark where it names it. */
  names: readonly string[]
  /**
   * The one Skill the row stands for, which the run command targets. Null when
   * the row picked a Skill out of a repository that holds several.
   */
  skill: BoardSkill | null
  reason: TrendingReason
}

/** One Skill, as the run command addresses it. */
export interface BoardSkill {
  owner: string
  repo: string
  /** The Skill directory name, the last segment of `owner/repo/name`. */
  name: string
}

/**
 * The Skill a row may print a run command for.
 *
 * Only a repository that holds exactly one Skill counts. Filler and the
 * `all` range pick one Skill out of a repository by a fixed rule, and a run
 * command would present that pick as the thing the stars belong to.
 */
export function singleSkill(owner: string, repo: string, name: string, repoSkillCount: number): BoardSkill | null {
  return repoSkillCount === 1 ? { owner, repo, name } : null
}

/**
 * Rows that earned the page its place in the index.
 *
 * A post, a surge, or a human review each count. Filler does not: it is
 * generic popularity available on any listing page, and letting it earn
 * indexability is how the catalog got suppressed in June.
 */
export function isEvidenced(row: TrendingBoardRow): boolean {
  return row.reason._tag !== 'filler' && row.reason._tag !== 'member'
}

/**
 * The fields `feedBoardRows` reads off a named Skill in the trending feed.
 *
 * Structural, like {@link LeaderboardRowInput}, so the mapper never imports
 * the server route. The optional fields cover an edge-cached feed from before
 * they existed, for the five minutes one can outlive a deploy.
 */
export interface FeedSkillInput {
  owner: string
  repo: string
  name: string
  canonicalName: string
  registryPath: string
  description: string | null
  stars: number | null
  starGain: number | null
  starGainDay: number | null
  evidence: BoardPostInput | null
  morePosts?: readonly BoardPostInput[]
  mentionsByDay?: readonly number[] | null
  starSeries?: readonly StarPoint[]
}

/** The fields `feedBoardRows` reads off a star-ranked filler Skill. */
export interface FeedFallbackInput {
  owner: string
  repo: string
  name: string
  canonicalName: string
  registryPath: string
  description: string | null
  stars: number
  repoSkillCount?: number
  starSeries?: readonly StarPoint[]
}

export interface FeedBoardInput {
  namedSkills: readonly FeedSkillInput[]
  fallback: readonly FeedFallbackInput[]
  /** Unix seconds the ranking was computed at. Every date on the board is measured against it. */
  computedAt: number
}

/**
 * The week and month boards, in one rank sequence.
 *
 * Evidenced rows always sit above star-only rows, never interleaved by score.
 * Ranking a 200,000-star repository against "two people named it" would let
 * raw popularity win the board every week, which is what the `all` range is
 * already for. Filling the tail with starred skills is honest; letting them
 * outrank the evidence is not.
 *
 * Filler drops any Skill already named. The two lists are drawn from
 * overlapping sources, and production served `ppt-master`, `hallmark` and
 * `karpathy-guidelines` in both at once, with different numbers against each.
 * The same skill twice is not two findings.
 */
export function feedBoardRows(feed: FeedBoardInput): TrendingBoardRow[] {
  const clock = feed.computedAt
  const named = feed.namedSkills.map((s): TrendingBoardRow => ({
    key: s.registryPath,
    owner: s.owner,
    repo: s.repo,
    name: s.name,
    title: s.canonicalName,
    to: s.registryPath,
    subtitle: `${s.owner}/${s.repo}`,
    description: s.description,
    stars: s.stars,
    starSeries: s.starSeries ?? [],
    names: [s.name, s.canonicalName],
    // A post or a single-Skill surge put this exact Skill here, so the run
    // command never guesses.
    skill: { owner: s.owner, repo: s.repo, name: s.name },
    reason: s.evidence
      ? { _tag: 'posts', posts: [s.evidence, ...(s.morePosts ?? [])].map(post => boardPost(post, clock)), mentionsByDay: s.mentionsByDay ?? null }
      : s.starGain !== null
        ? { _tag: 'surge', gain: s.starGain, when: s.starGainDay ? relativeDay(s.starGainDay, clock) : null }
        : { _tag: 'filler' },
  }))
  const shown = new Set(named.map(row => row.to))
  // Filler says so. A starred repository shown because the socials were quiet
  // must never pass for one that devs posted about.
  const filler = feed.fallback
    .filter(s => !shown.has(s.registryPath))
    .map((s): TrendingBoardRow => ({
      key: s.registryPath,
      owner: s.owner,
      repo: s.repo,
      name: s.name,
      title: s.canonicalName,
      to: s.registryPath,
      subtitle: `${s.owner}/${s.repo}`,
      description: s.description,
      stars: s.stars,
      starSeries: s.starSeries ?? [],
      names: [s.name, s.canonicalName],
      skill: singleSkill(s.owner, s.repo, s.name, s.repoSkillCount ?? 0),
      reason: { _tag: 'filler' },
    }))
  return [...named, ...filler]
}

/**
 * The fields `leaderboardBoardRows` reads off a `SkillsLeaderboardItem`.
 *
 * Structural on purpose. The mapper is pure and lives beside the page, and
 * depending on the server route's module here would drag a D1 handler into
 * every test that wants to check a label.
 */
export interface LeaderboardRowInput {
  owner: string
  repo: string
  description: string | null
  stars: number
  skillCount: number
  topSkill: {
    name: string
    /** Canonical route supplied by the API boundary. */
    registryPath: string
    description: string | null
  }
  /** Unix seconds of the repository's last push, or null when GitHub had none. */
  pushedAt: number | null
}

/**
 * A day, in the format the rest of the board already uses.
 *
 * Fixed locale and UTC on purpose. A date rendered from the server's zone and
 * then again from the visitor's is the shape that produces hydration
 * mismatches, and this string is rendered on both sides.
 */
export function formatBoardDay(timestamp: number | null): string | null {
  if (!timestamp)
    return null
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(timestamp * 1000)
}

/**
 * Reviewed repositories, in board shape, named by the skill they lead with.
 *
 * SKILL FIRST, EVERY RANGE. A skill is what somebody installs; a repository is
 * where it lives. The week and month ranges already put the skill name in the
 * title with `owner/repo` beneath it, and this range reads as a different
 * product if it puts the repository there instead.
 *
 * Stars still order the range, and stars belong to the repository rather than
 * to any one skill inside it. That is why `owner/repo` stays on the row as the
 * subtitle and the reason states the repository's skill count: the star
 * number sits beside the thing that earned it, exactly as it does on the feed
 * ranges, which have shown repository stars against a skill name all along.
 *
 * The featured skill is the repository's most recently updated one, which is
 * the ranking `/api/skills/leaderboard` already applies and documents. It is a
 * property of the repository, not a claim that this skill is its best.
 *
 * Every row's reason is `reviewed`: each passed a human eligibility review,
 * which is a stronger claim than the star-fallback rows the feed ranges pad
 * with. It is what keeps the range indexable.
 */
export function leaderboardBoardRows(
  items: readonly LeaderboardRowInput[],
): TrendingBoardRow[] {
  return items.map((item) => {
    const day = formatBoardDay(item.pushedAt)
    return {
      key: `${item.owner}/${item.repo}/${item.topSkill.name}`,
      owner: item.owner,
      repo: item.repo,
      name: item.topSkill.name,
      title: item.topSkill.name,
      to: item.topSkill.registryPath,
      subtitle: `${item.owner}/${item.repo}`,
      // The skill's own words first. The repository blurb describes the
      // container, and on a row named for the skill that reads as a mismatch.
      description: item.topSkill.description ?? item.description,
      stars: item.stars,
      starSeries: [],
      names: [item.topSkill.name],
      skill: singleSkill(item.owner, item.repo, item.topSkill.name, item.skillCount),
      reason: { _tag: 'reviewed', skillCount: item.skillCount, updated: day },
    }
  })
}
