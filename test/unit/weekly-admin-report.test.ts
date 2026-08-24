import { describe, expect, it } from 'vitest'
import { summarizeWeeklyEngagement } from '../../layers/admin/server/utils/weekly-engagement'

describe('weekly admin engagement', () => {
  it('reports recipient rates and explicit share intent', () => {
    expect(summarizeWeeklyEngagement({
      accepted: 12,
      unique_clicks: 3,
      unsubscribes: 1,
      share_intents: 2,
    })).toEqual({
      uniqueClicks: 3,
      uniqueClickRate: 0.25,
      unsubscribes: 1,
      unsubscribeRate: 1 / 12,
      shareIntents: 2,
    })
  })

  it('does not invent rates when nobody was accepted', () => {
    expect(summarizeWeeklyEngagement({
      accepted: 0,
      unique_clicks: 0,
      unsubscribes: 0,
      share_intents: 0,
    })).toMatchObject({
      uniqueClickRate: null,
      unsubscribeRate: null,
    })
  })
})
