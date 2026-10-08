import type { AnalyticsDataPoint } from './analytics'
import { analyticsIndex } from './analytics'

export type DemoCampaign = 'direct' | 'demo-component' | 'demo-page' | 'demo-motion'
export type DemoElapsed = 'unseen' | 'under-10s' | '10-29s' | '30-119s' | '120s-plus'
interface DemoContext { surface: string, slug: string, campaign: DemoCampaign }
export type DemoEngagement = DemoContext & (
  | { event: 'exposure' }
  | { event: 'share', elapsed: DemoElapsed }
  | { event: 'copy', format: 'agent' | 'terminal', elapsed: DemoElapsed }
)

export function demoElapsedBucket(milliseconds: number | null): DemoElapsed {
  if (milliseconds === null)
    return 'unseen'
  if (milliseconds < 10000)
    return 'under-10s'
  if (milliseconds < 30000)
    return '10-29s'
  return milliseconds < 120000 ? '30-119s' : '120s-plus'
}

/** Preserve the five existing blob meanings and double 1, the command copy count. */
export function demoEngagementDataPoint(event: DemoEngagement, country: string): AnalyticsDataPoint {
  return {
    blobs: [event.surface, '', 'demo', event.slug, country, event.event, event.event === 'copy' ? event.format : '', event.event === 'exposure' ? '' : event.elapsed, event.campaign],
    doubles: [0, 1],
    indexes: [analyticsIndex(event.slug)],
  }
}

/** An observer also reports initial entries below its threshold. */
export function demoFrameIsVisible(entry: { isIntersecting: boolean, intersectionRatio: number } | undefined): boolean {
  return !!entry?.isIntersecting && entry.intersectionRatio >= 0.5
}
