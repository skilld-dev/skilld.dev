/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { ANNOUNCE_MIN_EVIDENCE_BY_SOURCE } from '#shared/platform-weights'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { createDiscordNotifier } from '#shared/server/discord-notify'
import {
  markAnnounced,
  pickAnnouncements,
  reconcileLedger,
  submitDiscoveredRepos,
} from '#shared/server/discovery-ledger'
import { createGithubRepoSizer } from '#shared/server/discovery-size-guard'
import { scanPostsForSkills } from '#shared/server/skill-mention-scan'
import { createXClient, describeXError } from '#shared/server/x-client'
import { ingestXMentions } from '#shared/server/x-ingest'
import { resolveGithubBindings } from '../utils/github-client'

const CRON = '*/15 * * * *'

/**
 * Discovery poll: find repos the ecosystem is posting about on X, index them,
 * and record every one in the review ledger.
 *
 * WHY EVERY 15 MINUTES, AND WHY THAT COSTS ALMOST NOTHING.
 * The ingest passes a `since_id` cursor, so each published post is read
 * exactly once no matter how often this runs. Spend therefore tracks how much
 * the world posts (~250 matching posts/day, ~7.5k/month) and not the schedule.
 * Measured against a 2,000,000/month cap that is under half a percent. The
 * interval is chosen for freshness on the homepage, not for cost.
 *
 * The expensive half of the feature is `refresh-x-engagement`, which re-reads
 * posts to measure velocity. Cost controls live there.
 *
 * Four steps per run, in order, each safe to fail independently:
 *   1. ingest      poll X, persist posts, write ledger rows
 *   2. submit      enqueue indexing for pending discoveries
 *   3. reconcile   close out submissions that resolved, or that never will
 *   4. announce    post newly indexed, high-evidence repos to Discord
 */
export default defineScheduledTask({
  name: 'sync-x-mentions',
  cron: '*/15 * * * *',
  description: 'Poll X for posts naming skill repos, index them, and log them for review',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'sync-x-mentions', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('sync-x-mentions'),
    }, async () => {
      const startedAt = Date.now()
      const now = Math.floor(startedAt / 1000)

      const bearerToken = (env as unknown as { X_BEARER_KEY?: string }).X_BEARER_KEY
      if (!bearerToken) {
        // Not an error: the feature is simply not configured in this
        // environment. Reported so a missing secret in production is visible
        // rather than looking like a quiet run that found nothing.
        emitOperationalEvent(createWideEvent({ operation: 'sync-x-mentions', outcome: 'credential-missing' }))
        await reportJobRun(db, 'sync-x-mentions', {
          cron: CRON,
          status: 'partial',
          durationMs: Date.now() - startedAt,
          error: 'X_BEARER_KEY not set',
        })
        return { result: { skipped: 'no-bearer-token' } }
      }

      const client = createXClient({ bearerToken })
      const ingest = await ingestXMentions({ db, client, now })

      if (ingest.error)
        emitOperationalEvent(createWideEvent({ operation: 'sync-x-mentions-ingest', outcome: 'degraded' }))
      if (ingest.truncated)
        emitOperationalEvent(createWideEvent({ operation: 'sync-x-mentions-ingest', outcome: 'truncated', truncated: true }))

      // The sizer is what keeps an aggregator dump out of the registry. It is
      // passed explicitly rather than defaulted inside submitDiscoveredRepos so
      // that omitting it fails closed: no sizer means nothing is submitted.
      const submitted = await submitDiscoveredRepos({
        db,
        env,
        now,
        measureRepoSize: createGithubRepoSizer(resolveGithubBindings(env)),
      })
      // Name the individual skills these posts mention. Free: it reads posts
      // already stored and asks only GitHub, so it belongs in the same run
      // rather than paying for its own schedule.
      const skillScan = await scanPostsForSkills({
        db,
        bindings: resolveGithubBindings(env),
        now,
      })

      const reconciled = await reconcileLedger({ db, now })

      const announcement = await announceTrending(db, env, now)

      const summary = {
        postsRead: ingest.postsRead,
        postsStored: ingest.postsStored,
        postsSkippedNoRepo: ingest.postsSkippedNoRepo,
        reposSeen: ingest.reposSeen,
        ledgerInserted: ingest.ledgerInserted,
        ledgerUpdated: ingest.ledgerUpdated,
        truncated: ingest.truncated,
        submitQueued: submitted.queued,
        submitDuplicate: submitted.duplicate,
        submitFailed: submitted.failed,
        submitLastError: submitted.lastError,
        submitHeldOversized: submitted.heldOversized,
        submitDeferredUnmeasured: submitted.deferredUnmeasured,
        submitBacklog: submitted.truncated,
        skillsVerified: skillScan.verified,
        skillsRejected: skillScan.rejected,
        skillPostsScanned: skillScan.postsScanned,
        skillScanDeferred: skillScan.deferred,
        reconciledIndexed: reconciled.indexed,
        reconciledEmpty: reconciled.empty,
        reconciledRetried: reconciled.retried,
        reconcileStalled: reconciled.stalled,
        announced: announcement.announced,
        ingestError: ingest.error ? describeXError(ingest.error) : null,
        elapsedMs: Date.now() - startedAt,
      }

      emitOperationalEvent(createWideEvent({
        'operation': 'sync-x-mentions',
        'outcome': ingest.error ? 'partial' : 'completed',
        'scanned.count': summary.postsRead,
        'processed.count': summary.postsStored,
        'success.count': summary.announced,
        'truncated': ingest.truncated,
      }))
      await reportJobRun(db, 'sync-x-mentions', {
        cron: CRON,
        // A degraded ingest still did useful work, so it is 'partial' rather
        // than 'error': the run produced results and the reason is recorded.
        status: ingest.error ? 'partial' : 'ok',
        durationMs: summary.elapsedMs,
        error: summary.ingestError,
      })
      return { result: summary }
    })
  },
})

async function announceTrending(
  db: D1Database,
  env: Cloudflare.Env & Record<string, unknown>,
  now: number,
): Promise<{ announced: number }> {
  const webhookUrl = (env as unknown as { DISCORD_WEBHOOK_URL?: string }).DISCORD_WEBHOOK_URL
  if (!webhookUrl)
    return { announced: 0 }

  // Announcement is source-agnostic and runs here for every source, not just
  // X, because this is the only task on a quarter-hourly tick. Each source
  // clears its own threshold; see the note on why one number cannot serve all.
  const candidates = await pickAnnouncements({
    db,
    minEvidenceScoreBySource: ANNOUNCE_MIN_EVIDENCE_BY_SOURCE,
  })
  if (candidates.length === 0)
    return { announced: 0 }

  const skillCounts = await countSkills(db, candidates)
  const notifier = createDiscordNotifier({ webhookUrl })

  const result = await notifier.trendingRepos(candidates.map(c => ({
    owner: c.owner,
    repo: c.repo,
    evidenceUrl: c.evidenceUrl,
    evidenceText: c.evidenceText,
    source: c.source,
    evidenceScore: c.evidenceScore,
    authorHandle: authorFromUrl(c.evidenceUrl),
    skillCount: skillCounts.get(`${c.owner}/${c.repo}`) ?? 0,
    skilldUrl: `https://skilld.dev/gh/${c.owner}/${c.repo}`,
  })))

  if (result._tag !== 'sent') {
    // Deliberately not marked as announced: a failed post must be retried on
    // the next cycle, not silently dropped.
    emitOperationalEvent(createWideEvent({ operation: 'sync-x-mentions-notify', outcome: 'failed' }))
    return { announced: 0 }
  }

  await markAnnounced({ db, ids: candidates.map(c => c.id), now })
  return { announced: candidates.length }
}

/**
 * Author handle from an evidence permalink.
 *
 * Bluesky evidence links carry a DID rather than a handle, deliberately: a
 * handle can be changed or lost, which would rot every link already written to
 * the ledger. A DID is unreadable in a Discord field though, so it is shortened
 * rather than shown whole.
 */
function authorFromUrl(url: string): string {
  const x = url.match(/x\.com\/([^/]+)\/status\//)?.[1]
  if (x)
    return x
  const did = url.match(/bsky\.app\/profile\/([^/]+)\/post\//)?.[1]
  if (did)
    return did.startsWith('did:') ? `${did.slice(0, 16)}…` : did
  return 'unknown'
}

/**
 * Repos per lookup. D1 rejects more than 100 bound parameters per statement
 * and each repo costs two, so this is the engine's ceiling rather than a
 * tuning choice. The announcement list is capped at 10 today, but a chunked
 * query stays correct if that cap is ever raised.
 */
const REPOS_PER_LOOKUP = 50

async function countSkills(
  db: D1Database,
  entries: Array<{ owner: string, repo: string }>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()

  for (let i = 0; i < entries.length; i += REPOS_PER_LOOKUP) {
    const chunk = entries.slice(i, i + REPOS_PER_LOOKUP)
    const placeholders = chunk.map((_, j) => `(?${j * 2 + 1}, ?${j * 2 + 2})`).join(', ')
    const rows = (await db
      .prepare(
        `SELECT owner, repo, COUNT(*) AS n
         FROM skills
         WHERE (owner, repo) IN (VALUES ${placeholders}) AND source_resolved = 1
         GROUP BY owner, repo`,
      )
      .bind(...chunk.flatMap(e => [e.owner, e.repo]))
      .all<{ owner: string, repo: string, n: number }>()).results ?? []

    for (const row of rows)
      out.set(`${row.owner}/${row.repo}`, row.n)
  }

  return out
}
