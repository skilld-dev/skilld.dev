export interface WeeklyEngagementCounts {
  accepted: number
  /** Counted clicks on the issue's links, share links excluded. */
  clicks: number
  unsubscribes: number
  /** Counted clicks on the share link. */
  share_clicks: number
}

export interface WeeklyEngagementSummary {
  clicks: number
  /**
   * Clicks per accepted email. Counts are aggregate, so one reader can click
   * twice; this is not a unique click rate.
   */
  clicksPerAccepted: number | null
  unsubscribes: number
  unsubscribeRate: number | null
  shareClicks: number
}

function perAccepted(count: number, accepted: number): number | null {
  return accepted > 0 ? count / accepted : null
}

export function summarizeWeeklyEngagement(
  counts: WeeklyEngagementCounts,
): WeeklyEngagementSummary {
  return {
    clicks: counts.clicks,
    clicksPerAccepted: perAccepted(counts.clicks, counts.accepted),
    unsubscribes: counts.unsubscribes,
    unsubscribeRate: perAccepted(counts.unsubscribes, counts.accepted),
    shareClicks: counts.share_clicks,
  }
}
