import { describe, expect, it } from 'vitest'
import {
  buildCumulativeSkillHistory,
  buildObservedStarHistory,
} from '../../layers/registry/server/utils/repo-history'

describe('repository history', () => {
  it('builds chronological cumulative skill points and preserves the current count', () => {
    expect(buildCumulativeSkillHistory([
      200,
      100,
      100,
      null,
    ], 300)).toEqual([
      { at: 100, value: 2 },
      { at: 200, value: 3 },
      { at: 300, value: 4 },
    ])
  })

  it('downsamples skill history without losing its first or latest point', () => {
    const history = buildCumulativeSkillHistory(
      Array.from({ length: 40 }, (_, index) => index + 1),
      50,
      8,
    )

    expect(history).toHaveLength(8)
    expect(history[0]).toEqual({ at: 1, value: 1 })
    expect(history.at(-1)).toEqual({ at: 50, value: 40 })
  })

  it('includes an honest zero baseline when repository creation predates indexing', () => {
    expect(buildCumulativeSkillHistory([200, 200], 300, 16, 100)).toEqual([
      { at: 100, value: 0 },
      { at: 200, value: 2 },
      { at: 300, value: 2 },
    ])
  })

  it('reports that star history is collecting until two daily observations exist', () => {
    expect(buildObservedStarHistory([])).toEqual({
      _tag: 'untracked',
      points: [],
    })
    expect(buildObservedStarHistory([
      { observedDay: 200, stars: 42 },
    ])).toEqual({
      _tag: 'collecting',
      trackedSince: 200,
      points: [{ at: 200, value: 42 }],
    })
  })

  it('builds chronological star history from exact daily observations', () => {
    expect(buildObservedStarHistory([
      { observedDay: 300, stars: 44 },
      { observedDay: 100, stars: 40 },
      { observedDay: 200, stars: 42 },
    ])).toEqual({
      _tag: 'ready',
      approximate: true,
      trackedSince: 100,
      points: [
        { at: 100, value: 40 },
        { at: 200, value: 42 },
        { at: 300, value: 44 },
      ],
    })
  })
})
