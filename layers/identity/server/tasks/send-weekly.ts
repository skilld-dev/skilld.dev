/// <reference types="@cloudflare/workers-types" />

/**
 * The weekly email, sent once a week to everyone who has not opted out.
 *
 * Fires at one fixed hour. A single slot keeps the run to one pass and the
 * `(user_id, window_end)` claim to one week.
 *
 * The trending half is loaded once and shared. It is the same board for
 * everyone, and re-running the ranking per recipient would spend D1 reads to
 * compute an identical answer.
 */

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { sendEmailWithEnv, signUnsubToken } from '../utils/email'
import { runWeeklyForUser } from '../utils/weekly-delivery'
import { loadWeeklyRecipients, loadWeeklyTrending } from '../utils/weekly-select'
import { renderWeekly } from '../utils/weekly-template'

const CRON = '0 9 * * MON'
const WINDOW_SECONDS = 7 * 24 * 60 * 60

export default defineScheduledTask({
  name: 'send-weekly',
  cron: '0 9 * * MON',
  description: 'Send distinct trending Skills that have not appeared in the prior 60 days',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'send-weekly', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('send-weekly'),
    }, async () => {
      const config = useRuntimeConfig()
      const tokenKey = config.tokenKey as string
      const siteUrl = (config.publicSiteUrl as string) || 'https://skilld.dev'
      const emailFrom = config.email.from
      const startedAt = Date.now()
      const windowEnd = Math.floor(startedAt / 1_000)
      const windowStart = windowEnd - WINDOW_SECONDS

      const [recipients, trending] = await Promise.all([
        loadWeeklyRecipients(db),
        loadWeeklyTrending(db, windowEnd),
      ])

      const summary = {
        recipients: recipients.length,
        trending: trending.length,
        sent: 0,
        skipped: 0,
        alreadyClaimed: 0,
        failed: 0,
        uncertain: 0,
        errors: [] as string[],
      }

      for (const user of recipients) {
        const result = await runWeeklyForUser({
          db,
          now: () => Math.floor(Date.now() / 1_000),
          render: renderWeekly,
          signUnsubscribe: userId => signUnsubToken(userId, tokenKey),
          send: input => sendEmailWithEnv(env, { ...input, from: emailFrom }),
        }, user, { windowStart, windowEnd, trending, siteUrl })

        switch (result._tag) {
          case 'sent':
            summary.sent += 1
            break
          case 'skipped':
            summary.skipped += 1
            break
          case 'already_claimed':
            summary.alreadyClaimed += 1
            break
          case 'failed':
            summary.failed += 1
            summary.errors.push(`user ${user.id} ${result.stage}: ${result.error}`)
            break
          case 'uncertain':
            summary.uncertain += 1
            summary.errors.push(`user ${user.id} delivery uncertain: ${result.error}`)
            break
        }
      }

      const status = summary.failed > 0 || summary.uncertain > 0
        ? (summary.sent > 0 ? 'partial' : 'error')
        : 'ok'

      await reportJobRun(db, 'send-weekly', {
        cron: CRON,
        status,
        durationMs: Date.now() - startedAt,
        error: summary.errors.length ? summary.errors.join('; ') : null,
      })

      return { result: summary }
    })
  },
})
