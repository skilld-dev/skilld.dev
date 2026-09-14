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

export async function runDailyHealthChecks(db: D1Database, build: DailyHealthCheckEvent['build'], now: Date, deployment = 'unknown') {
  let summary: DailyHealthCheckSummary | undefined
  const report = await runChecks(checks, {
    event: {
      db,
      build: async (database: D1Database, options: { now: Date }) => {
        summary = await build(database, options)
        return summary
      },
    } satisfies DailyHealthCheckEvent,
    now,
    required: ['skilld.daily-health', 'skilld.daily-health-coverage'],
    identity: { site: 'skilld.dev', environment: import.meta.dev ? 'development' : 'production', deployment },
    timeoutMs: 60_000,
    totalTimeoutMs: 60_000,
    onError: (error, id) => console.error(`Daily health check failed: ${id}`, error),
  })
  if (!summary)
    throw new Error('Daily health collection did not complete. No email was sent.')
  const reasons = report.results.flatMap(({ result }) => result._tag === 'Pass' ? [] : [result.reason])
  return {
    ...summary,
    checkin: report,
    status: report.severity === 'fail' ? 'RED' as const : report.severity === 'warn' || report.coverage === 'incomplete' ? 'AMBER' as const : 'GREEN' as const,
    reasons: reasons.length ? reasons : summary.reasons,
  }
}
