/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { createBskyClient } from '#shared/server/bsky-client'
import { ingestBskyMentions } from '#shared/server/bsky-ingest'

const CRON = '17 */2 * * *'

/**
 * Discovery poll: find repos the ecosystem is posting about on Bluesky.
 *
 * WHY EVERY TWO HOURS, WHEN X RUNS EVERY FIFTEEN MINUTES.
 * Not cost: nothing here is metered. Volume. Bluesky carries roughly two
 * repo-bearing posts a day against X's 250, so a quarter-hourly poll would
 * make about a hundred requests a day to find nothing on almost all of them.
 * Two-hourly still puts a new post on the site within a couple of hours, which
 * is well inside the useful window for something that appears twice a day.
 *
 * The offset minute keeps this off the same tick as `sync-x-mentions`, so the
 * two do not contend for the same D1 connection every other hour.
 *
 * THIS TASK ONLY INGESTS. Submission, reconciliation and announcement are
 * source-agnostic and already run in `sync-x-mentions` every quarter hour
 * against the whole ledger, so repeating them here would be duplicated work
 * racing itself. Skill scanning is likewise shared: it reads stored posts of
 * any platform and asks only GitHub.
 */
export default defineScheduledTask({
  name: 'sync-bsky-mentions',
  cron: '17 */2 * * *',
  description: 'Poll Bluesky for posts naming skill repos and log them for review',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'sync-bsky-mentions', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('sync-bsky-mentions'),
    }, async () => {
      const startedAt = Date.now()
      const now = Math.floor(startedAt / 1000)

      const secrets = env as unknown as { BSKY_IDENTIFIER?: string, BSKY_APP_PASSWORD?: string }

      // Credentials are optional by design. The AppView answers search without
      // a token, so a missing secret degrades to anonymous reads rather than
      // skipping the run outright, which is what lets this source work before
      // anyone has set it up. It is reported all the same: anonymous reads are
      // throttled hard enough that a production run will lose queries to it.
      const client = createBskyClient({
        identifier: secrets.BSKY_IDENTIFIER,
        appPassword: secrets.BSKY_APP_PASSWORD,
      })

      const ingest = await ingestBskyMentions({ db, client, now })

      if (!ingest.authenticated) {
        emitOperationalEvent(createWideEvent({
          operation: 'sync-bsky-mentions',
          outcome: 'unauthenticated',
        }))
      }
      if (ingest.failedQueries.length > 0) {
        emitOperationalEvent(createWideEvent({
          'operation': 'sync-bsky-mentions-ingest',
          'outcome': 'degraded',
          'failed.count': ingest.failedQueries.length,
        }))
      }
      // Schema drift is loud. A non-zero count means the API returned a post
      // shape this client cannot read, which is silent data loss otherwise.
      if (ingest.postsUnparsable > 0) {
        emitOperationalEvent(createWideEvent({
          'operation': 'sync-bsky-mentions-ingest',
          'outcome': 'degraded',
          'failed.count': ingest.postsUnparsable,
        }))
      }
      if (ingest.truncatedQueries.length > 0) {
        emitOperationalEvent(createWideEvent({
          operation: 'sync-bsky-mentions-ingest',
          outcome: 'truncated',
          truncated: true,
        }))
      }

      const summary = {
        postsRead: ingest.postsRead,
        postsUnparsable: ingest.postsUnparsable,
        postsUnique: ingest.postsUnique,
        postsStored: ingest.postsStored,
        postsSkippedNoRepo: ingest.postsSkippedNoRepo,
        reposSeen: ingest.reposSeen,
        ledgerInserted: ingest.ledgerInserted,
        ledgerUpdated: ingest.ledgerUpdated,
        requestsMade: ingest.requestsMade,
        authenticated: ingest.authenticated,
        truncatedQueries: ingest.truncatedQueries,
        failedQueries: ingest.failedQueries,
        elapsedMs: Date.now() - startedAt,
      }

      // Every query failing means the whole poll found nothing, which is an
      // error. Some failing still produced results, which is partial.
      const allFailed = ingest.failedQueries.length > 0 && ingest.requestsMade === 0

      emitOperationalEvent(createWideEvent({
        'operation': 'sync-bsky-mentions',
        'outcome': allFailed ? 'failed' : ingest.failedQueries.length > 0 ? 'partial' : 'completed',
        'scanned.count': summary.postsUnique,
        'processed.count': summary.postsStored,
        'success.count': summary.ledgerInserted,
        'truncated': ingest.truncatedQueries.length > 0,
      }))
      await reportJobRun(db, 'sync-bsky-mentions', {
        cron: CRON,
        status: allFailed ? 'error' : ingest.failedQueries.length > 0 ? 'partial' : 'ok',
        durationMs: summary.elapsedMs,
        error: ingest.failedQueries.length > 0
          ? ingest.failedQueries.map(f => `${f.query}: ${f.error}`).join('; ')
          : null,
      })
      return { result: summary }
    })
  },
})
