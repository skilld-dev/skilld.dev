import type { CheckContext } from '@harlan-zw/nuxt-checkin/server'
import type { DailyHealthCheckSummary } from './daily-health-check'
import { runChecks } from '@harlan-zw/nuxt-checkin/server'
import checks from '#checkin/checks'

export interface DailyHealthCheckEvent {
  db: D1Database
  build: (db: D1Database, options: { now: Date }) => Promise<DailyHealthCheckSummary>
}

export function collectDailyHealth(context: CheckContext<DailyHealthCheckEvent>) {
  const event = context.event
  if (!event)
    throw new Error('Daily health check context is missing.')
  return context.collect(event.db, 'skilld.daily-health', async () => ({
    value: await event.build(event.db, { now: context.now }),
  }))
}

export function runDailyHealthChecks(db: D1Database, build: DailyHealthCheckEvent['build'], now: Date, deployment: string) {
  return runChecks(checks, {
    event: { db, build } satisfies DailyHealthCheckEvent,
    now,
    required: ['skilld.daily-health', 'skilld.daily-health-coverage'],
    identity: { site: 'skilld.dev', environment: import.meta.dev ? 'development' : 'production', deployment },
    timeoutMs: 60_000,
    totalTimeoutMs: 60_000,
    onError: (error, id) => console.error(`Daily health check failed: ${id}`, error),
  })
}
