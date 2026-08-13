/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { buildDailyHealthCheck, frontDoorFetcher, sendDailyHealthCheck } from '../utils/daily-health-check'
import { sendEmailWithEnv } from '../utils/email'

const CRON = '0 22 * * *'
const DEFAULT_OPERATOR_EMAIL = 'harlan@harlanzw.com'

function workerVersion(env: Cloudflare.Env): string | null {
  const metadata = env.CF_VERSION_METADATA
  if (!metadata?.id)
    return null
  return `${metadata.id.slice(0, 8)} deployed ${metadata.timestamp}`
}

export default defineScheduledTask({
  name: 'daily-health-check',
  cron: '0 22 * * *',
  description: 'Send the operator a daily health check for skilld traffic, delivery, pipeline freshness, job failures, and AI cost.',
  async run({ context }) {
    if (import.meta.dev)
      return { result: { _tag: 'SkippedInDev' as const } }

    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'daily-health-check', outcome: 'binding-missing' }))
      return { result: { _tag: 'MissingBindings' as const } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('daily-health-check'),
    }, async () => {
      const config = useRuntimeConfig()
      const to = String(config.healthCheckNotifyTo || DEFAULT_OPERATOR_EMAIL).trim()
      const from = config.email.from as EmailAddress
      const now = new Date()
      const startedAt = Date.now()

      const attempt = await sendDailyHealthCheck(db, {
        now,
        to,
        build: (database, options) => buildDailyHealthCheck(database, {
          ...options,
          fetcher: frontDoorFetcher(env),
          githubToken: env.GITHUB_TOKEN,
          workerVersion: workerVersion(env),
        }),
        send: input => sendEmailWithEnv(env, { ...input, from }),
      })
        .then(result => ({ _tag: 'Completed' as const, result }))
        .catch(error => ({
          _tag: 'InfrastructureFailure' as const,
          error: error instanceof Error ? error.message : String(error),
        }))

      const deliveryFailed = attempt._tag === 'Completed'
        && (attempt.result._tag === 'SendFailed' || attempt.result._tag === 'Uncertain')
      const error = attempt._tag === 'InfrastructureFailure'
        ? attempt.error
        : deliveryFailed
          ? attempt.result.error
          : null

      await reportJobRun(db, 'daily-health-check', {
        cron: CRON,
        status: error ? 'error' : 'ok',
        durationMs: Date.now() - startedAt,
        error,
        staleAfterSeconds: 36 * 60 * 60,
      })

      if (attempt._tag === 'InfrastructureFailure')
        throw new Error(attempt.error)
      return { result: attempt }
    })
  },
})
