// @vitest-environment node
import type { StarObservationPoint } from '../../shared/star-surge'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STAR_SURGE_CONFIG,
  describeStarSurge,
  detectStarSurge,
} from '../../shared/star-surge'

const DAY = 86_400
const START = 1_760_000_000 - (1_760_000_000 % DAY)

/** Build a daily series from consecutive star totals. */
function series(...totals: number[]): StarObservationPoint[] {
  return totals.map((stars, i) => ({ observedDay: START + i * DAY, stars }))
}

describe('detectStarSurge', () => {
  it('refuses to judge a repo with almost no history', () => {
    expect(detectStarSurge(series(100, 105))).toEqual({
      _tag: 'insufficient-history',
      observations: 2,
    })
  })

  it('calls steady growth steady', () => {
    const result = detectStarSurge(series(100, 105, 110, 115, 120, 125))
    expect(result._tag).toBe('steady')
  })

  it('flags a jump well above the repo\'s usual pace', () => {
    const result = detectStarSurge(series(100, 105, 110, 115, 120, 400))
    expect(result._tag).toBe('surge')
    if (result._tag !== 'surge')
      return
    expect(result.latestGain).toBe(280)
    expect(result.baselineGain).toBe(5)
    expect(result.multiple).toBe(56)
    expect(result.stars).toBe(400)
  })

  it('ignores a jump that is unusual but trivially small', () => {
    // 0 -> 4 stars a day is an infinite multiple of nothing. Firing on it
    // would make the signal meaningless for every quiet repo we track.
    const result = detectStarSurge(series(50, 50, 50, 50, 54))
    expect(result._tag).toBe('steady')
  })

  it('ignores ordinary growth on a repo that always grows fast', () => {
    const result = detectStarSurge(series(1000, 1100, 1200, 1300, 1400, 1500))
    expect(result._tag).toBe('steady')
  })

  it('flags an enormous jump even on a repo with a high baseline', () => {
    const result = detectStarSurge(series(1000, 1100, 1200, 1300, 1400, 1900))
    expect(result._tag).toBe('surge')
    if (result._tag === 'surge')
      expect(result.latestGain).toBeGreaterThanOrEqual(DEFAULT_STAR_SURGE_CONFIG.alwaysSurgeGain)
  })

  it('does not read a missed sync day as double growth', () => {
    // A two-day gap of 40 stars is 20/day, not 40. Treating the hole as one
    // day would report double the real rate and fire a false surge.
    const withGap: StarObservationPoint[] = [
      { observedDay: START, stars: 100 },
      { observedDay: START + DAY, stars: 110 },
      { observedDay: START + 2 * DAY, stars: 120 },
      { observedDay: START + 4 * DAY, stars: 160 },
    ]
    const result = detectStarSurge(withGap)
    expect(result._tag).toBe('steady')
    if (result._tag === 'steady')
      expect(result.latestGain).toBe(20)
  })

  it('treats a falling star count as no growth rather than negative', () => {
    const result = detectStarSurge(series(100, 110, 120, 90))
    expect(result._tag).toBe('steady')
    if (result._tag === 'steady')
      expect(result.latestGain).toBe(0)
  })

  it('is not blinded by the repo\'s own earlier spike', () => {
    // A mean baseline would still be inflated by the 500-star day and would
    // score today as normal. The median ignores its own outlier.
    const result = detectStarSurge(series(100, 105, 605, 610, 615, 620, 900))
    expect(result._tag).toBe('surge')
  })

  it('reads observations that arrive out of order', () => {
    const shuffled = [
      { observedDay: START + 2 * DAY, stars: 300 },
      { observedDay: START, stars: 100 },
      { observedDay: START + DAY, stars: 105 },
    ]
    const result = detectStarSurge(shuffled)
    expect(result._tag).toBe('surge')
    if (result._tag === 'surge')
      expect(result.latestGain).toBe(195)
  })
})

describe('describeStarSurge', () => {
  it('states the gain and the pace', () => {
    const result = detectStarSurge(series(100, 105, 110, 115, 120, 400))
    if (result._tag !== 'surge')
      throw new Error('expected a surge')
    expect(describeStarSurge({ owner: 'kepano', repo: 'obsidian-skills' }, result))
      .toBe('kepano/obsidian-skills gained 280 stars in a day, 56.0x its usual pace')
  })

  it('describes a climb from a standstill in words, not as infinity', () => {
    const result = detectStarSurge(series(100, 100, 100, 100, 500))
    if (result._tag !== 'surge')
      throw new Error('expected a surge')
    expect(describeStarSurge({ owner: 'o', repo: 'r' }, result))
      .toContain('up from a standstill')
  })
})
