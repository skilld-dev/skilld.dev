/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runIndexNow, runNeedsAttention } from '~~/server/utils/indexnow'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'

const CRON = '10 * * * *'

/**
 * Scheduled task: tell IndexNow about curated URLs that are new or changed.
 *
 * The URL set comes from the same sitemaps Google reads (skills, pages,
 * authors, sources), so a URL we do not advertise is never submitted. The caps
 * and the 429 backoff live in `server/utils/indexnow.ts`.
 */
export default defineScheduledTask({
  name: 'indexnow-submit',
  cron: '10 * * * *',
  description: 'Submit new or changed curated URLs to IndexNow',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    const self = env?.SELF as Fetcher | undefined
    if (!env || !db || !self) {
      emitOperationalEvent(createWideEvent({ operation: 'indexnow-submit', outcome: 'binding-missing' }))
      return { result: { error: 'no-db-or-self' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('indexnow-submit'),
    }, async () => {
      const startedAt = Date.now()
      const run = await runIndexNow({
        db,
        selfFetch: url => self.fetch(url),
        send: (input, init) => fetch(input, init),
        now: () => Math.floor(Date.now() / 1000),
      })
      const attention = runNeedsAttention(run)
      if (attention !== null) {
        // A halt or repeated failure must be readable in logs, not only in D1.
        console.error(`[indexnow-submit] ${run._tag}: ${attention}`)
        emitOperationalEvent(createWideEvent({
          operation: 'indexnow-submit',
          outcome: run._tag,
          reason: attention,
        }))
      }
      await reportJobRun(db, 'indexnow-submit', {
        cron: CRON,
        status: attention === null ? 'ok' : 'partial',
        durationMs: Date.now() - startedAt,
        error: attention,
      })
      return { result: run }
    })
  },
})
