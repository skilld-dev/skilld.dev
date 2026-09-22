export interface WeeklyEngagementCounts {
  accepted: number
  unsubscribes: number
}

export interface WeeklyEngagementSummary {
  unsubscribes: number
  unsubscribeRate: number | null
}

export function summarizeWeeklyEngagement(
  counts: WeeklyEngagementCounts,
): WeeklyEngagementSummary {
  return {
    unsubscribes: counts.unsubscribes,
    unsubscribeRate: counts.accepted > 0 ? counts.unsubscribes / counts.accepted : null,
  }
}
