// @vitest-environment node
import type { SkillTrendInput } from '../../shared/trending-skill-score'
import { describe, expect, it } from 'vitest'
import { rankSkillTrends, scoreSkillTrend } from '../../shared/trending-skill-score'

function skill(partial: Partial<SkillTrendInput> & { slug: string }): SkillTrendInput {
  return {
    owner: 'owner',
    repo: 'repo',
    canonicalName: partial.slug,
    social: null,
    github: null,
    ...partial,
  }
}

function social(authorCount: number, engagement = 0) {
  return {
    authorCount,
    mentionCount: authorCount,
    engagement,
    latestMentionAt: 1_760_000_000,
  }
}

function github(latestGain: number, baselineGain = 1) {
  return {
    latestGain,
    baselineGain,
    stars: 1000,
    observedDay: 1_759_968_000,
  }
}

describe('scoreSkillTrend attribution', () => {
  it('labels a skill only social evidence names', () => {
    expect(scoreSkillTrend(skill({ slug: 'a', social: social(2) })).attribution).toBe('social')
  })

  it('labels a skill only a star surge names', () => {
    expect(scoreSkillTrend(skill({ slug: 'a', github: github(500) })).attribution).toBe('github')
  })

  it('labels a skill both routes agree on', () => {
    expect(scoreSkillTrend(skill({ slug: 'a', social: social(1), github: github(500) })).attribution)
      .toBe('both')
  })
})

describe('scoreSkillTrend weighting', () => {
  it('weights social above stars for comparable evidence', () => {
    const bySocial = scoreSkillTrend(skill({ slug: 'a', social: social(1) }))
    const byStars = scoreSkillTrend(skill({ slug: 'b', github: github(100) }))

    expect(bySocial.score).toBeGreaterThan(byStars.score)
  })

  it('lets a genuine star explosion compete with a single mention', () => {
    // The weighting is a preference, not a veto: a single-skill repo gaining
    // thousands of stars a day is a real signal and must be able to rank.
    const bySocial = scoreSkillTrend(skill({ slug: 'a', social: social(1) }))
    const byStars = scoreSkillTrend(skill({ slug: 'b', github: github(5000, 5) }))

    expect(byStars.score).toBeGreaterThan(bySocial.score * 0.5)
  })

  it('ignores the repo baseline, which detect-star-surges already applied', () => {
    // Scoring the same gain differently by baseline would apply the anomaly
    // test twice: nothing reaches repo_star_surges without passing it once.
    const quietRepo = scoreSkillTrend(skill({ slug: 'a', github: github(200, 2) }))
    const busyRepo = scoreSkillTrend(skill({ slug: 'b', github: github(200, 200) }))

    expect(quietRepo.score).toBe(busyRepo.score)
  })

  it('holds the stated calibration: one mention is about a thousand-star day', () => {
    const oneMention = scoreSkillTrend(skill({ slug: 'a', social: social(1) }))
    const bigDay = scoreSkillTrend(skill({ slug: 'b', github: github(1000) }))

    expect(Math.abs(oneMention.score - bigDay.score)).toBeLessThan(0.1)
  })

  it('adds both halves when both routes name the skill', () => {
    const scored = scoreSkillTrend(skill({ slug: 'a', social: social(1), github: github(500) }))

    expect(scored.score).toBeCloseTo(scored.socialScore + scored.githubScore)
    expect(scored.socialScore).toBeGreaterThan(0)
    expect(scored.githubScore).toBeGreaterThan(0)
  })
})

describe('scoreSkillTrend breadth over depth', () => {
  it('ranks two separate people above one person with a viral post', () => {
    const broad = scoreSkillTrend(skill({ slug: 'broad', social: social(2, 2) }))
    const loud = scoreSkillTrend(skill({ slug: 'loud', social: social(1, 5000) }))

    expect(broad.score).toBeGreaterThan(loud.score)
  })

  it('never lets engagement be worth a whole extra author', () => {
    const one = scoreSkillTrend(skill({ slug: 'a', social: social(1, 10_000_000) }))
    const two = scoreSkillTrend(skill({ slug: 'b', social: social(2, 0) }))

    expect(two.score).toBeGreaterThan(one.score)
  })

  it('still uses engagement to separate equal breadth', () => {
    const quiet = scoreSkillTrend(skill({ slug: 'a', social: social(2, 1) }))
    const busy = scoreSkillTrend(skill({ slug: 'b', social: social(2, 900) }))

    expect(busy.score).toBeGreaterThan(quiet.score)
  })
})

describe('rankSkillTrends', () => {
  it('puts corroborated skills first when scores tie', () => {
    const ranked = rankSkillTrends([
      skill({ slug: 'social-only', social: social(2) }),
      skill({ slug: 'corroborated', social: social(2), github: github(0) }),
    ])

    expect(ranked.map(r => r.slug)).toEqual(['corroborated', 'social-only'])
  })

  it('orders by score before attribution', () => {
    const ranked = rankSkillTrends([
      skill({ slug: 'weak-but-both', social: social(1), github: github(1) }),
      skill({ slug: 'strong-social', social: social(5) }),
    ])

    expect(ranked[0]?.slug).toBe('strong-social')
  })
})
