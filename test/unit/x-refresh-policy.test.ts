// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REFRESH_POLICY,
  estimateDailyRefreshReads,
  estimateMonthlyCostUsd,
  planRefresh,
} from '../../shared/x-refresh-policy'

const NOW = 1_760_000_000
const HOUR = 3600

function plan(ageHours: number) {
  return planRefresh({ postedAt: NOW - ageHours * HOUR }, NOW)
}

describe('planRefresh', () => {
  it('keeps a brand new post hot even with no engagement yet', () => {
    // A two-minute-old post has zero favourites for reasons of physics, not
    // quality. Freezing it here would retire every post before it could trend.
    expect(plan(0.03).tier).toBe('hot')
  })

  it('schedules a hot post on the short interval', () => {
    expect(plan(1).nextRefreshAt).toBe(NOW + DEFAULT_REFRESH_POLICY.hotIntervalSeconds)
  })

  it('freezes a post the moment it leaves the window', () => {
    expect(plan(DEFAULT_REFRESH_POLICY.hotWindowHours + 0.1).tier).toBe('frozen')
  })

  it('never returns the warm tier, which billing made unaffordable', () => {
    const tiers = new Set(
      Array.from({ length: 200 }, (_, i) => plan(i).tier),
    )
    expect(tiers.has('warm')).toBe(false)
    expect([...tiers].sort()).toEqual(['frozen', 'hot'])
  })
})

describe('estimateDailyRefreshReads', () => {
  it('charges only the posts whose window crosses midnight UTC', () => {
    // Discovery already paid each post's first read. A 12-hour window means
    // half of uniformly timed posts span a boundary and are charged a second
    // time; the rest of the refreshing that day is free.
    expect(estimateDailyRefreshReads({ hot: 100 }, {
      ...DEFAULT_REFRESH_POLICY,
      hotWindowHours: 12,
    })).toBe(50)
  })

  it('charges every post once more when the window is a full day or longer', () => {
    expect(estimateDailyRefreshReads({ hot: 100 }, {
      ...DEFAULT_REFRESH_POLICY,
      hotWindowHours: 48,
    })).toBe(100)
  })

  it('does not grow when the refresh interval shortens, because re-reads are free', () => {
    const hourly = estimateDailyRefreshReads({ hot: 100 }, {
      ...DEFAULT_REFRESH_POLICY,
      hotIntervalSeconds: 3600,
    })
    const everyMinute = estimateDailyRefreshReads({ hot: 100 }, {
      ...DEFAULT_REFRESH_POLICY,
      hotIntervalSeconds: 60,
    })
    expect(everyMinute).toBe(hourly)
  })

  it('costs nothing when everything has been retired', () => {
    expect(estimateDailyRefreshReads({ hot: 0 })).toBe(0)
  })
})

describe('estimateMonthlyCostUsd', () => {
  it('prices a day of reads at the pay-per-use rate', () => {
    expect(estimateMonthlyCostUsd(33)).toBe(4.95)
  })

  it('keeps the default policy under the $5/month target', () => {
    // 22 discovery reads/day is the budget in x-ingest; refresh adds the
    // boundary crossings on top.
    const refresh = estimateDailyRefreshReads({ hot: 22 })
    expect(estimateMonthlyCostUsd(22 + refresh)).toBeLessThanOrEqual(5)
  })
})
