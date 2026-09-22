import type { LeaderboardRowInput } from '#shared/trending-range'
import { describe, expect, it } from 'vitest'
import {
  leaderboardBoardRows,
  resolveTrendingRange,
  SKILLS_NOUN,
  TRENDING_RANGES,
  trendingRangeDescription,
  trendingRangeHeading,
  trendingRangeMeta,
  trendingRangeTitle,
} from '#shared/trending-range'

function leaderboardRow(overrides: Partial<LeaderboardRowInput> = {}): LeaderboardRowInput {
  return {
    owner: 'anthropics',
    repo: 'skills',
    description: 'Reference skills for Claude Code.',
    stars: 12_400,
    skillCount: 9,
    topSkill: {
      name: 'pdf-processing',
      registryPath: '/gh/anthropics/skills/pdf-processing',
      description: 'Fill and read PDFs.',
    },
    pushedAt: 1_785_000_000,
    ...overrides,
  }
}

/**
 * The deleted leaderboard page named a featured skill per repository and dated
 * the repository, and the first pass at the all-time range dropped both. A repo
 * row that states neither is a name and a star count, which is thinner than the
 * page it replaced.
 */
describe('all-time rows are skill first, like every other range', () => {
  it('names the skill and links to it', () => {
    const [row] = leaderboardBoardRows([leaderboardRow()])

    // A skill is what somebody installs. The week and month ranges already put
    // the skill in the title, and this range has to read as the same product.
    expect(row?.title).toBe('pdf-processing')
    expect(row?.to).toBe('/gh/anthropics/skills/pdf-processing')
  })

  it('links a single-skill repository through its clean repository URL', () => {
    const [row] = leaderboardBoardRows([leaderboardRow({
      owner: 'ericzakariasson',
      repo: 'scandinavian-design',
      skillCount: 1,
      topSkill: {
        name: 'scandinavian-design',
        registryPath: '/gh/ericzakariasson/scandinavian-design',
        description: 'Scandinavian design guidance.',
      },
    })])

    expect(row?.to).toBe('/gh/ericzakariasson/scandinavian-design')
  })

  it('keeps the repository beside it, since the stars are the repository\'s', () => {
    const [row] = leaderboardBoardRows([leaderboardRow()])

    expect(row?.subtitle).toBe('anthropics/skills')
    expect(row?.stars).toBe(12_400)
    expect(row?.basis).toBe('9 skills · reviewed for eligibility')
  })

  it('describes the skill rather than its container', () => {
    const [row] = leaderboardBoardRows([leaderboardRow()])

    expect(row?.description).toBe('Fill and read PDFs.')
  })

  it('falls back to the repository blurb when the skill has none', () => {
    const [row] = leaderboardBoardRows([leaderboardRow({
      topSkill: { name: 'pdf-processing', registryPath: '/gh/anthropics/skills/pdf-processing', description: null },
    })])

    expect(row?.description).toBe('Reference skills for Claude Code.')
  })

  it('dates the row from the repository\'s last push', () => {
    const [row] = leaderboardBoardRows([leaderboardRow()])

    expect(row?.when).toBe('Updated 25 July 2026')
  })

  it('states no date when GitHub reported no push', () => {
    const [row] = leaderboardBoardRows([leaderboardRow({ pushedAt: null })])

    // Absent, never guessed. A repo with no push date is not a repo pushed today.
    expect(row?.when).toBeNull()
  })

  it('keys on the skill so two repos cannot collide', () => {
    const rows = leaderboardBoardRows([
      leaderboardRow(),
      leaderboardRow({
        repo: 'other',
        topSkill: { name: 'pdf-processing', registryPath: '/gh/anthropics/other/pdf-processing', description: null },
      }),
    ])

    expect(new Set(rows.map(r => r.key)).size).toBe(2)
  })
})

describe('trending range resolution', () => {
  it('serves the month board when no range is asked for', () => {
    expect(resolveTrendingRange(undefined)).toBe('month')
    expect(resolveTrendingRange(null)).toBe('month')
    expect(resolveTrendingRange('')).toBe('month')
  })

  it('asks the feed for 720 hours on month and 168 on week', () => {
    expect(trendingRangeMeta('month').windowHours).toBe(720)
    expect(trendingRangeMeta('week').windowHours).toBe(168)
    // `all` reads the leaderboard endpoint, which has no window at all.
    expect(trendingRangeMeta('all').windowHours).toBeNull()
  })

  it('falls back to month for a range it does not serve, rather than erroring', () => {
    expect(resolveTrendingRange('yesterday')).toBe('month')
    expect(resolveTrendingRange('WEEK')).toBe('month')
    expect(resolveTrendingRange(7)).toBe('month')
    expect(resolveTrendingRange({ range: 'week' })).toBe('month')
    // Repeated query keys arrive as an array.
    expect(resolveTrendingRange(['all', 'week'])).toBe('all')
    expect(resolveTrendingRange(['nonsense'])).toBe('month')
  })

  it('keeps every range on its own canonical, so none demotes another', () => {
    expect(trendingRangeMeta('month').canonical).toBe('https://skilld.dev/skills/trending')
    expect(trendingRangeMeta('week').canonical).toBe('https://skilld.dev/skills/trending?range=week')
    expect(trendingRangeMeta('all').canonical).toBe('https://skilld.dev/skills/trending?range=all')
    expect(new Set(TRENDING_RANGES.map(range => range.canonical)).size).toBe(3)
  })

  it('carries the retired leaderboard keyword target on the all range', () => {
    expect(trendingRangeMeta('all').title).toBe('Top Agent Skill Repositories on GitHub')
    expect(trendingRangeDescription('all', 0)).toContain('reviewed for eligibility')
    expect(trendingRangeDescription('all', 0)).toContain('ranked by current GitHub stars')
  })

  it('names its own period in the feed range descriptions', () => {
    expect(trendingRangeDescription('month', 12)).toContain('12 agent skills')
    expect(trendingRangeDescription('month', 12)).toContain('this month')
    expect(trendingRangeDescription('week', 12)).toContain('this week')
    // An empty board must not advertise a count of zero.
    expect(trendingRangeDescription('month', 0)).not.toContain('0 agent skills')
  })
})

describe('leaderboard rows on the trending board', () => {
  it('ranks by repository stars while naming the skill', () => {
    const [row] = leaderboardBoardRows([leaderboardRow()])

    expect(row).toMatchObject({
      key: 'anthropics/skills/pdf-processing',
      owner: 'anthropics',
      title: 'pdf-processing',
      to: '/gh/anthropics/skills/pdf-processing',
      subtitle: 'anthropics/skills',
      description: 'Fill and read PDFs.',
      stars: 12_400,
    })
  })

  it('states the skill count and the eligibility review as the row basis', () => {
    expect(leaderboardBoardRows([leaderboardRow()])[0]!.basis)
      .toBe('9 skills · reviewed for eligibility')
    expect(leaderboardBoardRows([leaderboardRow({ skillCount: 1 })])[0]!.basis)
      .toBe('1 skill · reviewed for eligibility')
  })

  it('counts every row as evidenced, because each passed a human review', () => {
    const rows = leaderboardBoardRows([leaderboardRow(), leaderboardRow({ repo: 'other' })])

    expect(rows.every(row => row.evidenced)).toBe(true)
    expect(rows.map(row => row.key)).toEqual(['anthropics/skills/pdf-processing', 'anthropics/other/pdf-processing'])
  })

  it('carries no social evidence, since a star ranking has none to show', () => {
    // `when` is excluded: it dates the repository's last push, which is the
    // row's own fact rather than something a person said about it.
    expect(leaderboardBoardRows([leaderboardRow()])[0]).toMatchObject({
      evidenceUrl: null,
      quote: null,
      platform: null,
      handle: null,
      engagement: null,
    })
  })
})

/**
 * A dated title is the SERP convention for this topic, and it is only worth
 * having while it is true. These pin both halves: the stamp appears on the
 * ranges that cover a live window, and never on the one that does not.
 */
describe('month-stamped titles', () => {
  // 2026-08-19T00:00:00Z
  const clock = 1_787_270_400

  it('stamps the month the board was computed in', () => {
    expect(trendingRangeTitle('month', clock)).toBe('Trending Agent Skills, August 2026')
    expect(trendingRangeTitle('week', clock)).toBe('Trending Agent Skills This Week, August 2026')
  })

  it('leaves the all-time range undated', () => {
    // It ranks by lifetime stars. A month on it is a false claim, and its stem
    // carries the repository cluster inherited from /skills/leaderboard.
    expect(trendingRangeTitle('all', clock)).toBe('Top Agent Skill Repositories on GitHub')
  })

  it('drops the stamp when the board failed to load', () => {
    expect(trendingRangeTitle('month', 0)).toBe('Trending Agent Skills')
  })
})

/**
 * The heading exists to back the dated title up. Google rewrites a dated title
 * when the page itself never states the date, and the `<h1>` is the first
 * candidate it reaches for.
 */
describe('month-stamped heading', () => {
  const clock = 1_787_270_400

  it('stamps the month range, punctuated like the title', () => {
    expect(trendingRangeHeading('month', clock)).toBe(`Trending ${SKILLS_NOUN}, August 2026`)
  })

  it('leaves the ranges that name their own window alone', () => {
    expect(trendingRangeHeading('week', clock)).toBe(`Trending ${SKILLS_NOUN} this week`)
    expect(trendingRangeHeading('all', clock)).toBe('Top skill repositories')
  })

  it('falls back to the undated heading when the board failed to load', () => {
    expect(trendingRangeHeading('month', 0)).toBe(`Trending ${SKILLS_NOUN} this month`)
  })
})

/**
 * The `<title>` targets the head term and the page speaks the brand's category
 * noun. Both are deliberate (docs/work/EXECUTE-seo-keyword-rework.md, COPY.md), and a well-meaning
 * edit that aligns them would cost one of the two.
 */
describe('titles and headings use different nouns on purpose', () => {
  const clock = 1_787_270_400

  it('joins the noun with a non-breaking space, so balance cannot split it', () => {
    expect(SKILLS_NOUN).toBe('agent\u00A0skills')
  })

  it('keeps the head term in the title', () => {
    expect(trendingRangeTitle('month', clock)).toContain('Agent Skills')
  })

  it('keeps the brand noun in the heading', () => {
    expect(trendingRangeHeading('month', clock)).toContain(SKILLS_NOUN)
    expect(trendingRangeHeading('month', clock)).not.toContain('Claude')
  })
})
