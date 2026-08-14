/**
 * Rank individual skills, from the two routes that can name one accurately.
 *
 * A skill is trending only when we can say WHICH skill is trending. There are
 * exactly two ways to know that, and everything else is guesswork:
 *
 *   SOCIAL     A post names the skill, matched against the vocabulary its own
 *              repository ships. See `skill-name-match.ts`.
 *   GITHUB     A repository's stars surged AND that repository holds exactly
 *              one skill, so the surge cannot belong to anything else.
 *
 * THE SINGLE-SKILL RULE IS THE WHOLE POINT OF THE GITHUB ROUTE. A surge on a
 * repo holding twenty skills says twenty things at once, which is to say
 * nothing: attributing it to any one of them invents a fact. Those repos are
 * still discovered and still ranked as repos; they just cannot claim a skill
 * is trending. `anthropics/skills` surging tells you nothing about
 * `frontend-design`, and pretending otherwise is exactly the scaled-content
 * shape that suppressed the site in June 2026.
 *
 * SOCIAL OUTWEIGHS STARS, deliberately. A star is a bookmark on a repository;
 * a post is a person telling other people to use a specific skill by name. The
 * second is the harder thing to manufacture and the better predictor of an
 * install, so {@link SOCIAL_WEIGHT} is several times {@link GITHUB_WEIGHT}.
 *
 * Pure data-in/data-out. No D1, no clock: `now` is a parameter so ranking is
 * deterministic under test.
 */

/** Which routes could name this skill. `both` is the strongest claim available. */
export type SkillAttribution = 'social' | 'github' | 'both'

export interface SocialEvidence {
  /**
   * Separate accounts that named the skill above the engagement bar.
   *
   * Display only. Ranking uses {@link authorWeight}, because a raw count
   * treats "someone recommended this" and "this appeared in a list of thirty"
   * as the same endorsement.
   */
  authorCount: number
  /**
   * Authors, diluted by how many skills each of their posts named.
   *
   * A post naming one skill contributes a whole author; a post naming thirty
   * contributes a thirtieth of one. `x-ingest.ts` already applies this rule to
   * repository evidence and documents why: one popular "here are 20 repos"
   * thread handed every entry an identical score and buried the repos posts
   * were actually about.
   *
   * The skill-level loader never inherited it, and production showed the same
   * failure. A single "my top 30 Claude repos" post put `design-taste-frontend`
   * and `planning-with-files` at ranks 1 and 2 on two authors each, above
   * `install-anti-slop`, which a person had posted about specifically to 911
   * likes. Both of the top two even quoted that same listicle as their
   * evidence, so the page showed the identical paragraph twice.
   */
  authorWeight: number
  mentionCount: number
  /** Weighted engagement summed across qualifying posts, on its own scale. */
  engagement: number
  latestMentionAt: number
}

export interface GithubEvidence {
  /** Stars gained per day across the latest interval. */
  latestGain: number
  /** The repo's median daily gain, for judging how unusual the latest is. */
  baselineGain: number
  stars: number
  observedDay: number
}

export interface SkillTrendInput {
  owner: string
  repo: string
  slug: string
  canonicalName: string
  social: SocialEvidence | null
  github: GithubEvidence | null
}

export interface SkillTrendScore extends SkillTrendInput {
  score: number
  attribution: SkillAttribution
  /** The two halves, kept separate so a row can explain itself in the UI. */
  socialScore: number
  githubScore: number
}

/**
 * Relative worth of the two routes.
 *
 * Calibrated so that one person naming a skill weighs about the same as a
 * single-skill repository gaining a thousand stars in a day. Both are real
 * signals; the first is rarer and closer to intent.
 */
export const SOCIAL_WEIGHT = 3
export const GITHUB_WEIGHT = 1

/**
 * Engagement breaks ties between skills. It never decides one.
 *
 * BREADTH BEATS DEPTH, and this function is where that survives contact with
 * a viral post. Five people naming a skill once each is a trend; one person
 * naming it to a huge audience is a person having a good day. An earlier
 * version added `log10(engagement)` directly, which let a single post with
 * 5,000 engagement (3.7) outrank two separate authors (2.0) and inverted the
 * whole principle.
 *
 * So the bonus saturates strictly below 1: any amount of engagement is worth
 * less than one additional human being. Raw engagement is also the number most
 * distorted by platform, with X clearing thousands where Bluesky clears single
 * digits, which is a second reason not to let it drive.
 */
function engagementBonus(engagement: number): number {
  const scaled = Math.log10(1 + Math.max(0, engagement))
  return scaled / (1 + scaled)
}

function socialStrength(social: SocialEvidence): number {
  return social.authorWeight + engagementBonus(social.engagement)
}

/**
 * Star gain, log-scaled.
 *
 * Daily gains span four orders of magnitude across real repos, so a linear
 * term would let one viral repository outrank every social signal on the page
 * permanently. 100 stars/day scores 2, 1,000 scores 3, 10,000 scores 4. With
 * {@link SOCIAL_WEIGHT} at 3, that puts a thousand-star day level with one
 * person naming the skill, which is the intended calibration.
 *
 * DELIBERATELY NO "SURPRISE VS BASELINE" TERM. An earlier version multiplied
 * by how far the gain exceeded the repo's median, which let a 100-star day on
 * a quiet repo outscore a human mention and inverted the weighting. It was
 * also redundant: `repo_star_surges` holds only rows `detect-star-surges`
 * already judged anomalous against that same baseline, so applying the test
 * twice counts it twice. `baselineGain` is carried for display, not scoring.
 */
function githubStrength(github: GithubEvidence): number {
  return Math.log10(1 + Math.max(0, github.latestGain))
}

export function scoreSkillTrend(input: SkillTrendInput): SkillTrendScore {
  const socialScore = input.social ? socialStrength(input.social) * SOCIAL_WEIGHT : 0
  const githubScore = input.github ? githubStrength(input.github) * GITHUB_WEIGHT : 0

  const attribution: SkillAttribution
    = input.social && input.github ? 'both' : input.social ? 'social' : 'github'

  return {
    ...input,
    socialScore,
    githubScore,
    score: socialScore + githubScore,
    attribution,
  }
}

/**
 * Rank a set of skills.
 *
 * Corroboration wins ties rather than being bolted on as a bonus: when two
 * skills score the same, the one both routes agree on is the safer claim to
 * put on a page, so it goes first.
 */
export function rankSkillTrends(inputs: readonly SkillTrendInput[]): SkillTrendScore[] {
  const rank: Record<SkillAttribution, number> = { both: 2, social: 1, github: 0 }
  return inputs
    .map(scoreSkillTrend)
    .sort((a, b) =>
      b.score - a.score
      || rank[b.attribution] - rank[a.attribution]
      || (b.social?.authorCount ?? 0) - (a.social?.authorCount ?? 0)
      || (b.social?.latestMentionAt ?? 0) - (a.social?.latestMentionAt ?? 0))
}
