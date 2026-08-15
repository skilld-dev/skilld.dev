// @vitest-environment node
import type { TrendingBasisInput } from '../../shared/trending-basis'
import { describe, expect, it } from 'vitest'
import { relativeDay, trendingBasis } from '../../shared/trending-basis'

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
  it('states the author count and nothing about stars for a social row', () => {
    expect(trendingBasis(row({ authorCount: 3, hasEvidence: true }), NOW))
      .toBe('3 people named it')
  })

  it('says nothing when a single author is already quoted above the line', () => {
    expect(trendingBasis(row({ authorCount: 1, hasEvidence: true }), NOW))
      .toBeNull()
  })

  it('names the single author when there is no quote to carry the handle', () => {
    expect(trendingBasis(row({ authorCount: 1 }), NOW))
      .toBe('1 person named it')
  })

  it('states the star gain and dates it for a star-only row', () => {
    expect(trendingBasis(row({ starGain: 865, starGainDay: NOW - 2 * 86_400 }), NOW))
      .toBe('+865 stars this week · 2d ago')
  })

  it('states both claims when both routes qualified the skill', () => {
    const basis = trendingBasis(
      row({ authorCount: 4, starGain: 1200, starGainDay: NOW - 86_400, hasEvidence: true }),
      NOW,
    )
    expect(basis).toBe('4 people named it · +1,200 stars this week')
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
