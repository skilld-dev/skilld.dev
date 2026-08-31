import type { AiBinding } from '../utils/digest-summary'
import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import {
  runDigestDeliveryForUser,
} from '../utils/digest-delivery'
import {
  loadDigestEligibleUsers,
  selectDigestForUser,
} from '../utils/digest-select'
import { summariseChanges } from '../utils/digest-summary'
import { renderDigest } from '../utils/digest-template'
import { sendEmailWithEnv, signUnsubToken } from '../utils/email'

const CRON = '0 9 1 * *'

export default defineScheduledTask({
  name: 'send-digests',
  cron: '0 9 1 * *',
  description: 'Send monthly changes to liked Skills and watched Repositories',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'send-digests', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('send-digests'),
    }, async () => {
      const config = useRuntimeConfig()
      const tokenKey = config.tokenKey as string
      const ai = env?.AI as AiBinding | undefined
      const siteUrl = (config.publicSiteUrl as string) || 'https://skilld.dev'
      const emailFrom = config.email.from
      const startedAt = Date.now()
      const scheduledAt = Math.floor(startedAt / 1_000)
      const users = await loadDigestEligibleUsers(db)
      const summary = {
        eligible: users.length,
        fired: users.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        claimed: 0,
        uncertain: 0,
        alreadyProcessed: 0,
        aiFallbacks: 0,
        errors: [] as string[],
      }

      for (const user of users) {
        const result = await runDigestDeliveryForUser({
          db,
          now: () => Math.floor(Date.now() / 1_000),
          newClaimToken: () => crypto.randomUUID(),
          select: selectDigestForUser,
          summarise: ai
            ? input => summariseChanges({ ai, ...input })
            : async () => ({ _tag: 'fallback', reason: 'binding_missing' }),
          render: renderDigest,
          signUnsubscribe: userId => signUnsubToken(userId, tokenKey),
          send: input => sendEmailWithEnv(env, { ...input, from: emailFrom }),
        }, user, {
          scheduledAt,
          siteUrl,
        })

        if (result._tag === 'sent') {
          summary.sent += 1
          if (result.aiFallbackReason) {
            summary.aiFallbacks += 1
            summary.errors.push(`user ${user.id} AI fallback: ${result.aiFallbackReason}`)
          }
        }
        else if (result._tag === 'skipped') {
          summary.skipped += 1
        }
        else if (result._tag === 'failed') {
          summary.failed += 1
          summary.errors.push(`user ${user.id} ${result.stage}: ${result.error}`)
        }
        else if (result._tag === 'claimed') {
          summary.claimed += 1
        }
        else if (result._tag === 'delivery_uncertain') {
          summary.uncertain += 1
          summary.errors.push(`user ${user.id} delivery uncertain: ${result.reason}: ${result.error}`)
        }
        else {
          summary.alreadyProcessed += 1
        }
      }

      const status = summary.failed > 0 || summary.uncertain > 0
        ? (summary.sent > 0 || summary.skipped > 0 ? 'partial' : 'error')
        : summary.aiFallbacks > 0
          ? 'partial'
          : 'ok'
      await reportJobRun(db, 'send-digests', {
        cron: CRON,
        status,
        durationMs: Date.now() - startedAt,
        error: summary.errors.length ? summary.errors.join('; ') : null,
      })

      return { result: summary }
    })
  },
})
