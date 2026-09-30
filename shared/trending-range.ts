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

export type TrendingRange = 'week' | 'month' | 'all'

/**
 * The range a bare `/skills/trending` serves.
 *
 * A month, not a week. A week of social evidence routinely returns fewer than
 * eight named skills, which is the bar the page sets for its own indexability,
 * so the shorter window made the default board excuse itself from the index.
 */
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

export const DEFAULT_TRENDING_RANGE: TrendingRange = 'month'

const SITE_ORIGIN = 'https://skilld.dev'

/**
 * The category noun, held on one line.
 *
 * The space is U+00A0. `.compact-page-header__title` caps at 15ch and sets
 * `text-wrap: balance`, which balances line lengths without regard for where
 * a phrase ends: it broke "Trending agent / skills, August 2026" across the
 * noun itself. The non-breaking space moves the break to the comma. Measured
 * against the rendered heading, not assumed.
 */
export const SKILLS_NOUN = 'agent\u00A0skills'

export interface TrendingRangeMeta {
  readonly id: TrendingRange
  /** Switcher label. Short verb-free noun, per the UI chrome register. */
  readonly label: string
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
  /** The row's primary link text. */
  title: string
  /** Where the primary link goes. */
  to: string
  /** Secondary identifier beside the title. Null when the title already is it. */
  subtitle: string | null
  description: string | null
  stars: number | null
  /** Why it is on the board. Null when only its star count speaks for it. */
  basis: string | null
  when: string | null
  evidenceUrl: string | null
  /** What the person actually said. The claim in their words, not ours. */
  quote: string | null
  /** Which network carried it, so the row can show that network's mark. */
  platform: 'x' | 'bsky' | null
  /** Who said it. */
  handle: string | null
  /** The speaker's profile image, when the read that captured the post carried one. */
  authorAvatar: string | null
  /** Likes on that specific post. Zero means it landed quietly, not unknown. */
  engagement: number | null
  /** Separate people who posted about it besides the displayed post author. */
  otherPosters: string | null
  /** True when a person or a surge put it here, false when it is filling space. */
  evidenced: boolean
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
 * subtitle and the basis line states the repository's skill count: the star
 * number sits beside the thing that earned it, exactly as it does on the feed
 * ranges, which have shown repository stars against a skill name all along.
 *
 * The featured skill is the repository's most recently updated one, which is
 * the ranking `/api/skills/leaderboard` already applies and documents. It is a
 * property of the repository, not a claim that this skill is its best.
 *
 * `evidenced` is true for every row: each passed a human eligibility review,
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
      title: item.topSkill.name,
      to: item.topSkill.registryPath,
      subtitle: `${item.owner}/${item.repo}`,
      // The skill's own words first. The repository blurb describes the
      // container, and on a row named for the skill that reads as a mismatch.
      description: item.topSkill.description ?? item.description,
      stars: item.stars,
      basis: `${item.skillCount.toLocaleString()} ${item.skillCount === 1 ? 'skill' : 'skills'} · reviewed for eligibility`,
      when: day ? `Updated ${day}` : null,
      evidenceUrl: null,
      quote: null,
      platform: null,
      handle: null,
      authorAvatar: null,
      engagement: null,
      otherPosters: null,
      evidenced: true,
    }
  })
}
