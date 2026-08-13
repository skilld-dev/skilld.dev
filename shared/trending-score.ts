/**
 * Ranking for "hot" repos, derived from X engagement.
 *
 * Pure data-in/data-out: the caller loads rows, this decides the order, and
 * every tuning constant is visible in one place. No D1, no clock, no config
 * lookup. `now` is a parameter so the ranking is deterministic in tests.
 *
 * Three ideas drive the shape of the score.
 *
 * 1. BOOKMARKS OUTWEIGH FAVOURITES. For a tool a reader has to go install,
 *    a bookmark is intent and a favourite is applause. The gap is not subtle:
 *    the reference post for this feature carried 4,649 bookmarks against
 *    2,218 favourites. Weighting them equally would rank showmanship over
 *    things people actually mean to use.
 *
 * 2. BREADTH BEATS DEPTH. One post at 500 favourites is a person having a
 *    good day. Five people posting the same repo unprompted is a trend. Each
 *    author therefore contributes only their single best post for a given
 *    repo, and distinct authors multiply the total. This is also the entire
 *    anti-spam story: an account posting one repo thirty times counts once.
 *
 * 3. VELOCITY, NOT TOTAL. A repo that gained 200 favourites in the last hour
 *    is hotter than one sitting on 2,000 earned last week. Where two metric
 *    snapshots exist we score the delta; where only one exists we fall back
 *    to the total, decayed hard by age, so a cold-start repo is not stuck at
 *    zero until its second snapshot lands.
 */

export interface ScoredPostInput {
  postId: string
  authorId: string
  postedAt: number
  /**
   * How many repos this post names in total. A post's endorsement is split
   * across everything it endorses, so a thread listing ten repos gives each a
   * tenth of its weight.
   *
   * A live run showed why this cannot be left out: one tweet naming seven
   * repos put all seven on the trending page at an identical score, filling
   * it with near-duplicate entries sourced from the same quoted post.
   */
  repoCount: number
  /** Latest observed engagement. */
  current: EngagementCounts
  /**
   * The previous snapshot, when one exists. Absent on a post's first cycle,
   * which is the normal state for anything discovered in the last hour.
   */
  previous: (EngagementCounts & { observedAt: number }) | null
  observedAt: number
}

export interface EngagementCounts {
  favouriteCount: number
  repostCount: number
  replyCount: number
  quoteCount: number
  bookmarkCount: number
}

export interface TrendingWeights {
  favourite: number
  repost: number
  reply: number
  quote: number
  bookmark: number
  /** Hours for the age decay to halve a post's contribution. */
  halfLifeHours: number
  /**
   * Weight on the decayed-total floor every post receives. Below 1 because a
   * total is a weaker claim than a measured delta: it says the post did well
   * at some point, not that it is moving now.
   */
  coldStartFactor: number
  /**
   * Weight on measured hourly velocity, added on top of the floor. Raising it
   * makes the page favour what is moving right now; lowering it makes the page
   * favour what has done well across the window.
   */
  velocityWeight: number
  /** Posts older than this contribute nothing, regardless of engagement. */
  maxAgeHours: number
}

export const DEFAULT_TRENDING_WEIGHTS: TrendingWeights = {
  favourite: 1,
  repost: 3,
  reply: 1,
  quote: 4,
  // See note 1: intent to use, not applause.
  bookmark: 5,
  halfLifeHours: 24,
  coldStartFactor: 0.35,
  velocityWeight: 1,
  maxAgeHours: 24 * 14,
}

export interface RepoTrendInput {
  owner: string
  repo: string
  posts: ScoredPostInput[]
}

export interface RepoTrendScore {
  owner: string
  repo: string
  score: number
  /** Distinct authors whose posts contributed, after per-author dedup. */
  authorCount: number
  postCount: number
  /** Engagement totals across contributing posts, for display. */
  totals: EngagementCounts
  /** Highest-scoring single post, used as the quoted evidence on the page. */
  topPostId: string | null
  /**
   * Every contributing post, best first.
   *
   * The page needs more than the single best one: one thread naming several
   * repos contributes to all of them, and quoting it against each in turn puts
   * the same wall of text on the page repeatedly. The caller walks this list to
   * find evidence not already spent on a higher-ranked repo.
   */
  contributingPostIds: string[]
  /** Most recent contributing post, for the "new" ordering. */
  latestPostedAt: number
}

function weightedEngagement(counts: EngagementCounts, w: TrendingWeights): number {
  return counts.favouriteCount * w.favourite
    + counts.repostCount * w.repost
    + counts.replyCount * w.reply
    + counts.quoteCount * w.quote
    + counts.bookmarkCount * w.bookmark
}

function decay(ageHours: number, halfLifeHours: number): number {
  if (ageHours <= 0)
    return 1
  return 2 ** (-ageHours / halfLifeHours)
}

/**
 * Score a single post. Exported because the ingest task uses it to decide
 * which posts deserve a place on the paid engagement-refresh tier, and that
 * decision must use exactly the same notion of "interesting" as the ranking.
 */
export function scorePost(
  post: ScoredPostInput,
  now: number,
  weights: TrendingWeights = DEFAULT_TRENDING_WEIGHTS,
): number {
  const ageHours = (now - post.postedAt) / 3600
  if (ageHours > weights.maxAgeHours)
    return 0

  // Split across everything the post names, before anything else is computed.
  const share = 1 / Math.max(1, post.repoCount)
  const currentWeighted = weightedEngagement(post.current, weights) * share
  const ageFactor = decay(ageHours, weights.halfLifeHours)

  // Every post scores its decayed total as a floor, whether or not velocity
  // can be measured. An earlier version returned pure velocity, which made a
  // flat hour score exactly zero: a repo with 2,000 favourites that happened
  // not to move between two snapshots dropped off the page completely, and a
  // quiet hour across the board emptied the list. A live run reproduced that,
  // returning nothing at all. Trending should decay, not fall off a cliff.
  const baseline = currentWeighted * ageFactor * weights.coldStartFactor

  if (!post.previous)
    return baseline

  const elapsedHours = (post.observedAt - post.previous.observedAt) / 3600
  // Snapshots closer together than a minute are a double-run of the refresh
  // task, not a measurement window. Dividing by that interval would turn
  // rounding noise into an enormous velocity.
  if (elapsedHours < 1 / 60)
    return baseline

  const delta = currentWeighted - weightedEngagement(post.previous, weights) * share
  // Counts can fall when posts are deleted or engagement is withdrawn. A
  // negative velocity is not evidence of anything, so it floors at zero
  // rather than dragging the repo below untouched competitors.
  const velocityPerHour = Math.max(0, delta) / elapsedHours

  // Velocity is the differentiator on top of the floor: two repos with equal
  // totals are separated by which one is still moving.
  return baseline + velocityPerHour * ageFactor * weights.velocityWeight
}

export function scoreRepoTrend(
  input: RepoTrendInput,
  now: number,
  weights: TrendingWeights = DEFAULT_TRENDING_WEIGHTS,
): RepoTrendScore {
  // Note 2: one contribution per author, their best post.
  const bestByAuthor = new Map<string, { post: ScoredPostInput, score: number }>()
  for (const post of input.posts) {
    const score = scorePost(post, now, weights)
    const held = bestByAuthor.get(post.authorId)
    if (!held || score > held.score)
      bestByAuthor.set(post.authorId, { post, score })
  }

  const contributions = [...bestByAuthor.values()]
  const base = contributions.reduce((sum, c) => sum + c.score, 0)

  // log2 so the tenth independent poster still helps but does not swamp the
  // signal from a repo that two very engaged people are talking about.
  const breadth = 1 + Math.log2(Math.max(1, contributions.length))

  const totals: EngagementCounts = {
    favouriteCount: 0,
    repostCount: 0,
    replyCount: 0,
    quoteCount: 0,
    bookmarkCount: 0,
  }
  for (const { post } of contributions) {
    totals.favouriteCount += post.current.favouriteCount
    totals.repostCount += post.current.repostCount
    totals.replyCount += post.current.replyCount
    totals.quoteCount += post.current.quoteCount
    totals.bookmarkCount += post.current.bookmarkCount
  }

  const ordered = [...contributions].sort((a, b) => b.score - a.score)
  const top = ordered[0] ?? null

  return {
    owner: input.owner,
    repo: input.repo,
    score: base * breadth,
    authorCount: contributions.length,
    postCount: input.posts.length,
    totals,
    topPostId: top?.post.postId ?? null,
    contributingPostIds: ordered.map(c => c.post.postId),
    latestPostedAt: contributions.reduce((max, c) => Math.max(max, c.post.postedAt), 0),
  }
}

export function rankRepoTrends(
  inputs: RepoTrendInput[],
  now: number,
  weights: TrendingWeights = DEFAULT_TRENDING_WEIGHTS,
): RepoTrendScore[] {
  return inputs
    .map(input => scoreRepoTrend(input, now, weights))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score || b.latestPostedAt - a.latestPostedAt)
}
