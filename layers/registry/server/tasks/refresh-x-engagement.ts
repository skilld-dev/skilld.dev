/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { notifyXApiFailureWithEnv } from '~~/server/utils/x-api-alert'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { createXClient, describeXError } from '#shared/server/x-client'
import { DEFAULT_MAX_POSTS_PER_RUN, refreshXEngagement } from '#shared/server/x-refresh'
import { DEFAULT_REFRESH_POLICY, estimateDailyRefreshReads } from '#shared/x-refresh-policy'

const CRON = '10 * * * *'

/**
 * Re-read engagement on tracked posts so trending measures velocity.
 *
 * THIS IS THE TASK THAT COSTS MONEY. Discovery reads each post once via a
 * cursor; this one re-reads posts we already hold, so its spend is
 * (tracked posts x refreshes per post) and it is the only place where a
 * shorter interval means a larger bill.
 *
 * Three bounds, all adjustable, all logged on every run:
 *   - hourly cadence, matching DEFAULT_REFRESH_POLICY.hotIntervalSeconds
 *   - DEFAULT_MAX_POSTS_PER_RUN reads per run, a hard ceiling
 *   - tiering in planRefresh, which retires posts that are old or went nowhere
 *
 * At observed volume the steady state is roughly 250 hot and 400 warm posts,
 * which prices out near 7,600 reads/day, or about 11% of a 2,000,000/month
 * cap. `estimatedDailyReads` in the summary reports the live figure so drift
 * shows up in task output before it shows up on an invoice.
 *
 * The run offset (:10) keeps this off the same minute as sync-x-mentions,
 * which fires on the quarter hour.
 */
export default defineScheduledTask({
  name: 'refresh-x-engagement',
  cron: '10 * * * *',
  description: 'Re-read X engagement for tracked posts so trending can measure velocity',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'refresh-x-engagement', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('refresh-x-engagement'),
    }, async () => {
      const startedAt = Date.now()
      const now = Math.floor(startedAt / 1000)

      const bearerToken = (env as unknown as { X_BEARER_KEY?: string }).X_BEARER_KEY
      if (!bearerToken) {
        emitOperationalEvent(createWideEvent({ operation: 'refresh-x-engagement', outcome: 'credential-missing' }))
        await sendFailureAlert(db, env, { _tag: 'not-configured' }, now)
        await reportJobRun(db, 'refresh-x-engagement', {
          cron: CRON,
          status: 'partial',
          durationMs: Date.now() - startedAt,
          error: 'X_BEARER_KEY not set',
        })
        return { result: { skipped: 'no-bearer-token' } }
      }

      const client = createXClient({ bearerToken })
      const result = await refreshXEngagement({
        db,
        client,
        now,
        maxPostsPerRun: DEFAULT_MAX_POSTS_PER_RUN,
      })

      if (result.error) {
        emitOperationalEvent(createWideEvent({ operation: 'refresh-x-engagement', outcome: 'degraded' }))
        await sendFailureAlert(db, env, result.error, now)
      }

      const tiers = await countTiers(db)
      const summary = {
        claimed: result.claimed,
        refreshed: result.refreshed,
        vanished: result.vanished,
        stayedHot: result.promotedToHot,
        frozen: result.frozen,
        postsRead: result.postsRead,
        snapshotsPruned: result.snapshotsPruned,
        trackedHot: tiers.hot,
        trackedWarm: tiers.warm,
        trackedFrozen: tiers.frozen,
        // Live cost projection. Compare against the monthly cap before
        // shortening any interval in DEFAULT_REFRESH_POLICY.
        estimatedDailyReads: estimateDailyRefreshReads(tiers, DEFAULT_REFRESH_POLICY),
        error: result.error ? describeXError(result.error) : null,
        elapsedMs: Date.now() - startedAt,
      }

      // Reaching the ceiling every run means the backlog is growing faster
      // than it drains, which silently caps how fresh trending can be.
      if (result.claimed >= DEFAULT_MAX_POSTS_PER_RUN)
        emitOperationalEvent(createWideEvent({ operation: 'refresh-x-engagement', outcome: 'truncated', truncated: true }))

      emitOperationalEvent(createWideEvent({
        'operation': 'refresh-x-engagement',
        'outcome': result.error ? 'partial' : 'completed',
        'scanned.count': result.claimed,
        'processed.count': result.updated,
        'failed.count': result.failed,
        'truncated': result.claimed >= DEFAULT_MAX_POSTS_PER_RUN,
      }))
      await reportJobRun(db, 'refresh-x-engagement', {
        cron: CRON,
        status: result.error ? 'partial' : 'ok',
        durationMs: summary.elapsedMs,
        error: summary.error,
      })
      return { result: summary }
    })
  },
})

async function countTiers(db: D1Database): Promise<{ hot: number, warm: number, frozen: number }> {
  const rows = (await db
    .prepare(`SELECT refresh_tier, COUNT(*) AS n FROM x_posts GROUP BY refresh_tier`)
    .all<{ refresh_tier: 'hot' | 'warm' | 'frozen', n: number }>()).results ?? []
  const out = { hot: 0, warm: 0, frozen: 0 }
  for (const row of rows)
    out[row.refresh_tier] = row.n
  return out
}

async function sendFailureAlert(
  db: D1Database,
  env: Cloudflare.Env,
  error: Parameters<typeof notifyXApiFailureWithEnv>[0]['error'],
  now: number,
): Promise<void> {
  const config = useRuntimeConfig()
  const result = await notifyXApiFailureWithEnv({
    db,
    env,
    taskName: 'refresh-x-engagement',
    error,
    now,
    to: String(config.healthCheckNotifyTo).trim(),
    from: config.email.from as EmailAddress,
  })
  if (result._tag === 'send-failed' || result._tag === 'uncertain') {
    emitOperationalEvent(createWideEvent({
      operation: 'refresh-x-engagement-alert',
      outcome: result._tag,
    }))
  }
}
