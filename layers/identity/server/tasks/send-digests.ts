import type { DigestUserOutcome } from '../utils/digest-run-summary'
import type { AiBinding } from '../utils/digest-summary'
import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import {
  runDigestDeliveryForUser,
} from '../utils/digest-delivery'
import { summariseDigestRun } from '../utils/digest-run-summary'
import {
  loadDigestEligibleUsers,
  selectDigestForUser,
} from '../utils/digest-select'
import { resolveDigestSummariser } from '../utils/digest-summary'
import { renderDigest } from '../utils/digest-template'
import { sendEmailWithEnv, signUnsubToken } from '../utils/email'

const CRON = '0 9 1 * *'
// Kill switch: the per-repo digest sentence runs `anthropic/claude-haiku-4.5`,
// a partner model brokered through the Workers AI binding, so every call bills
// against AI Gateway credits. Those credits are exhausted, so each monthly run
// returned `provider_failure: 2021: Insufficient AI Gateway credits`, delivered
// the digest on the no-summary template, and still reported `partial`. That
// raised a monthly AMBER on the operator health email for a feature nobody had
// decided to keep. Paused by decision until Loop 2 has an audience worth tuning
// the sentence for. Re-enabling costs AI Gateway credits and one send to
// verify. Flip back to false to resume.
const DIGEST_AI_SUMMARY_PAUSED = true

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
      const summarise = resolveDigestSummariser({
        paused: DIGEST_AI_SUMMARY_PAUSED,
        ai,
      })
      const outcomes: DigestUserOutcome[] = []

      for (const user of users) {
        const result = await runDigestDeliveryForUser({
          db,
          now: () => Math.floor(Date.now() / 1_000),
          newClaimToken: () => crypto.randomUUID(),
          select: selectDigestForUser,
          summarise,
          render: renderDigest,
          signUnsubscribe: userId => signUnsubToken(userId, tokenKey),
          send: input => sendEmailWithEnv(env, { ...input, from: emailFrom }),
        }, user, {
          scheduledAt,
          siteUrl,
        })
        outcomes.push({ userId: user.id, result })
      }

      const { summary, status } = summariseDigestRun(outcomes, {
        aiSummaryPaused: DIGEST_AI_SUMMARY_PAUSED,
      })
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
