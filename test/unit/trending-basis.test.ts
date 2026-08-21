// @vitest-environment node
import type { TrendingBasisInput } from '../../shared/trending-basis'
import { describe, expect, it } from 'vitest'
import { relativeDay, trendingBasis, trendingOtherPosters } from '../../shared/trending-basis'

const NOW = 1_760_000_000

function row(partial: Partial<TrendingBasisInput> = {}): TrendingBasisInput {
  return {
    authorCount: 0,
    starGain: null,
    starGainDay: null,
    hasEvidence: false,
    ...partial,
  }
}

describe('trendingBasis', () => {
  it('leaves other authors to the displayed post footer', () => {
    expect(trendingBasis(row({ authorCount: 3, hasEvidence: true }), NOW))
      .toBeNull()
  })

  it('says nothing when a single author is already quoted above the line', () => {
    expect(trendingBasis(row({ authorCount: 1, hasEvidence: true }), NOW))
      .toBeNull()
  })

  it('names the single author when there is no quote to carry the handle', () => {
    expect(trendingBasis(row({ authorCount: 1 }), NOW))
      .toBe('1 dev talked about it')
  })

  it('states the star gain and dates it for a star-only row', () => {
    expect(trendingBasis(row({ starGain: 865, starGainDay: NOW - 2 * 86_400 }), NOW))
      .toBe('+865 stars this week · 2d ago')
  })

  it('leaves the author claim to the post when both routes qualified the skill', () => {
    const basis = trendingBasis(
      row({ authorCount: 4, starGain: 1200, starGainDay: NOW - 86_400, hasEvidence: true }),
      NOW,
    )
    expect(basis).toBe('+1,200 stars this week')
  })

  it('leaves the date to the quote block when a post is shown', () => {
    expect(trendingBasis(row({ starGain: 10, starGainDay: NOW - 86_400, hasEvidence: true }), NOW))
      .toBe('+10 stars this week')
  })

  it('returns null when a row has nothing it can claim', () => {
    expect(trendingBasis(row({ hasEvidence: true }), NOW)).toBeNull()
  })

  it('keeps a zero star gain visible rather than reading it as absent', () => {
    expect(trendingBasis(row({ starGain: 0, starGainDay: NOW }), NOW))
      .toBe('+0 stars this week · just now')
  })
})

describe('trendingOtherPosters', () => {
  it('counts people other than the displayed post author', () => {
    expect(trendingOtherPosters(3, true)).toBe('2 other devs posted about it')
  })

  it('uses the singular label for one other person', () => {
    expect(trendingOtherPosters(2, true)).toBe('1 other dev posted about it')
  })

  it('adds nothing when the displayed post is the only evidence', () => {
    expect(trendingOtherPosters(1, true)).toBeNull()
  })

  it('adds nothing when no post is displayed', () => {
    expect(trendingOtherPosters(3, false)).toBeNull()
  })
})

describe('relativeDay', () => {
  it('reads the reference clock, not the current time', () => {
    expect(relativeDay(NOW - 4 * 86_400, NOW)).toBe('4d ago')
    expect(relativeDay(NOW - 4 * 86_400, NOW + 86_400)).toBe('5d ago')
  })

  it('falls back to hours inside the first day', () => {
    expect(relativeDay(NOW - 5 * 3600, NOW)).toBe('5h ago')
  })

  it('collapses anything under an hour to just now', () => {
    expect(relativeDay(NOW - 59 * 60, NOW)).toBe('just now')
  })
})
