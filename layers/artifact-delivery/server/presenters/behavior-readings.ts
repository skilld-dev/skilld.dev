import type { BehaviorReading, BehaviorReadingsResponse } from '#shared/behavior-readings'

export function presentBehaviorReadings(readings: BehaviorReading[]): BehaviorReadingsResponse {
  return { items: readings }
}
