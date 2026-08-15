import type { LeaderboardRowInput } from '#shared/trending-range'
import { describe, expect, it } from 'vitest'
import {
  leaderboardBoardRows,
  resolveTrendingRange,
  TRENDING_RANGES,
  trendingRangeDescription,
  trendingRangeMeta,
} from '#shared/trending-range'

function leaderboardRow(overrides: Partial<LeaderboardRowInput> = {}): LeaderboardRowInput {
  return {
    owner: 'anthropics',
    repo: 'skills',
    description: 'Reference skills for Claude Code.',
    stars: 12_400,
    skillCount: 9,
    topSkill: { name: 'pdf-processing', slug: 'pdf-processing', description: 'Fill and read PDFs.' },
    ...overrides,
  }
}

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
    expect(trendingRangeMeta('all').title).toBe('Top Claude Skill Repositories on GitHub')
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
  it('ranks the repository, so the repository is what the row names and links', () => {
    const [row] = leaderboardBoardRows([leaderboardRow()])

    expect(row).toMatchObject({
      key: 'anthropics/skills',
      owner: 'anthropics',
      title: 'anthropics/skills',
      to: '/gh/anthropics/skills',
      subtitle: null,
      description: 'Reference skills for Claude Code.',
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
    expect(rows.map(row => row.key)).toEqual(['anthropics/skills', 'anthropics/other'])
  })

  it('carries no social evidence, since a star ranking has none to show', () => {
    expect(leaderboardBoardRows([leaderboardRow()])[0]).toMatchObject({
      when: null,
      evidenceUrl: null,
      quote: null,
      platform: null,
      handle: null,
      engagement: null,
    })
  })

  it('falls back to the top skill description when the repository has none', () => {
    expect(leaderboardBoardRows([leaderboardRow({ description: null })])[0]!.description)
      .toBe('Fill and read PDFs.')
  })
})
