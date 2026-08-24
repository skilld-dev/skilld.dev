export interface WeeklyEngagementCounts {
  accepted: number
  unique_clicks: number
  unsubscribes: number
  share_intents: number
}

export interface WeeklyEngagementSummary {
  uniqueClicks: number
  uniqueClickRate: number | null
  unsubscribes: number
  unsubscribeRate: number | null
  shareIntents: number
}

function recipientRate(count: number, accepted: number): number | null {
  return accepted > 0 ? count / accepted : null
}

export function summarizeWeeklyEngagement(
  counts: WeeklyEngagementCounts,
): WeeklyEngagementSummary {
  return {
    uniqueClicks: counts.unique_clicks,
    uniqueClickRate: recipientRate(counts.unique_clicks, counts.accepted),
    unsubscribes: counts.unsubscribes,
    unsubscribeRate: recipientRate(counts.unsubscribes, counts.accepted),
    shareIntents: counts.share_intents,
  }
}
