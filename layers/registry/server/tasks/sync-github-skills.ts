import type { DiscoveryClaimUnavailable } from '../utils/discovery-candidates'
import type { SyncRepoStats } from '../utils/sync-repo'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { STALE_SYNC_SECONDS, SUBSCRIBED_REPO_STALE_SECONDS } from '~~/server/utils/sync-thresholds'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { pAll } from '#shared/server/p-all'
import { getTaskEnv } from '#shared/server/task-env'
import {
  claimDiscoveryCandidate,
  classifyDiscoveryClaimUnavailable,
  discoveryOutcomeFromSyncStats,
  finishDiscoveryCandidateAttempt,
} from '../utils/discovery-candidates'
/// <reference types="@cloudflare/workers-types" />
import { resolveGithubBindings } from '../utils/github-client'
import {
  DISCOVERY_SYNC_CANDIDATES_SQL,
  GENERAL_SYNC_CANDIDATES_SQL,
  prioritizeRepoSyncCandidates,
  SUBSCRIBED_SYNC_CANDIDATES_SQL,
} from '../utils/sync-candidates'
import { syncRepo } from '../utils/sync-repo'

const CONCURRENCY = 8
const RATE_LIMIT_GUARD = 200 // bail when remaining drops below this
// Cloudflare Workers cap outbound subrequests at 1000 per invocation
// AND scheduled handlers have CPU time limits. GraphQL JSON parsing per
// repo is heavier than REST per-call (one big payload vs many small),
// so subrequest-cap headroom doesn't translate to CPU headroom. 500 hit
// outcome=exceededCpu in production; 250 leaves margin even at the
// raised 5min CPU ceiling.
const MAX_REPOS_PER_RUN = 250
const CRON = '0 * * * *'
const CLAIM_STALE_SECONDS = 30 * 60

type SyncWorkResult
  = | { _tag: 'sync_stats', stats: SyncRepoStats }
    | { _tag: 'claim_unavailable', owner: string, repo: string, claim: DiscoveryClaimUnavailable }
    | { _tag: 'candidate_finish_stale', owner: string, repo: string }

/**
 * Scheduled task: process due admitted repos and durable discovery candidates,
 * syncing skills, revisions, and activity. Prioritises subscriptions first
 * (using last_synced_at as a natural cursor), runs CONCURRENCY repos in
 * parallel, and bails cleanly when the GitHub rate-limit headroom drops
 * below RATE_LIMIT_GUARD so the next cycle can pick up where it stopped.
 *
 * Candidate claims keep overlapping invocations from processing one repo.
 */
export default defineScheduledTask({
  name: 'sync-github-skills',
  cron: '0 * * * *',
  description: 'Sync admitted GitHub repos and due discovery candidates',
  async run({ context }) {
    const env = getTaskEnv(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      console.warn('[sync-github-skills] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('sync-github-skills'),
    }, async () => {
      const bindings = resolveGithubBindings(env)
      if (!bindings.GITHUB_TOKEN) {
        console.warn('[sync-github-skills] GITHUB_TOKEN not configured; running unauthenticated (60/hr cap)')
      }

      const now = Math.floor(Date.now() / 1000)

      // Phase 3: subscription-prioritised pre-pass. Watched repos use the short
      // freshness window so digests reflect fresh activity. The general fleet
      // only becomes eligible at STALE_SYNC_SECONDS; previously it had no cutoff
      // and continuously rechecked up to 250 repos every hour.
      const subRows = await db
        .prepare(SUBSCRIBED_SYNC_CANDIDATES_SQL)
        .bind(now - SUBSCRIBED_REPO_STALE_SECONDS)
        .all<{ owner: string, repo: string, ls: number | null }>()

      // Repo-level `repo_meta_synced_at` advances even when GitHub's tree is
      // unchanged, making this a real due-work cursor instead of an old content
      // timestamp that never moves on the cheapest skip path.
      const stalenessRows = await db
        .prepare(GENERAL_SYNC_CANDIDATES_SQL)
        .bind(now - STALE_SYNC_SECONDS)
        .all<{ owner: string, repo: string, ls: number | null }>()

      const discoveryRows = await db
        .prepare(DISCOVERY_SYNC_CANDIDATES_SQL)
        .bind(now, now - CLAIM_STALE_SECONDS)
        .all<{ owner: string, repo: string, ls: number | null, owner_verified: number }>()

      const dueDiscoveryKeys = new Set(
        (discoveryRows.results ?? []).map(row => `${row.owner}/${row.repo}`),
      )

      const { ordered: orderedRepos, deferred } = prioritizeRepoSyncCandidates(
        subRows.results ?? [],
        stalenessRows.results ?? [],
        discoveryRows.results ?? [],
        MAX_REPOS_PER_RUN,
      )

      const startedAt = Date.now()
      let aborted = false
      let lowestRemaining = Number.POSITIVE_INFINITY

      const settled = await pAll(orderedRepos, CONCURRENCY, async ({ owner, repo, ownerVerified }) => {
        if (aborted) {
          return {
            _tag: 'sync_stats',
            stats: { owner, repo, status: 'rate-limited', skillsSeen: 0, skillsUpserted: 0, revisionsInserted: 0, activityEmitted: 0, reason: 'cycle aborted' },
          } satisfies SyncWorkResult
        }

        const discoveryDue = dueDiscoveryKeys.has(`${owner}/${repo}`)
        const claimToken = discoveryDue ? crypto.randomUUID() : null
        if (claimToken) {
          const claim = await claimDiscoveryCandidate(db, {
            owner,
            repo,
            now,
            staleBefore: now - CLAIM_STALE_SECONDS,
            token: claimToken,
          })
          if (claim._tag !== 'claimed')
            return { _tag: 'claim_unavailable', owner, repo, claim } satisfies SyncWorkResult
          ownerVerified = claim.ownerVerified
        }

        let stats: SyncRepoStats
        try {
          stats = await syncRepo(owner, repo, bindings, db, { ownerVerified })
        }
        catch (err) {
          stats = {
            owner,
            repo,
            status: 'failed',
            skillsSeen: 0,
            skillsUpserted: 0,
            revisionsInserted: 0,
            activityEmitted: 0,
            reason: err instanceof Error ? err.message : String(err),
          } satisfies SyncRepoStats
        }

        if (stats.rateLimitRemaining != null && stats.rateLimitRemaining < lowestRemaining)
          lowestRemaining = stats.rateLimitRemaining

        // An unauthorized credential fails every remaining repo identically, so
        // stop the cycle instead of burning the whole candidate list on it.
        if (stats.status === 'unauthorized')
          aborted = true

        if (stats.status === 'rate-limited' || (stats.rateLimitRemaining != null && stats.rateLimitRemaining < RATE_LIMIT_GUARD))
          aborted = true

        if (claimToken) {
          const finishResult = await finishDiscoveryCandidateAttempt(db, {
            owner,
            repo,
            token: claimToken,
            now: Math.floor(Date.now() / 1000),
            outcome: discoveryOutcomeFromSyncStats(stats),
          })
          if (finishResult === 'stale_claim')
            return { _tag: 'candidate_finish_stale', owner, repo } satisfies SyncWorkResult
        }

        return { _tag: 'sync_stats', stats } satisfies SyncWorkResult
      })

      const summary = {
        reposTotal: orderedRepos.length,
        reposDeferred: deferred,
        reposIndexed: 0,
        reposVerifiedOnly: 0,
        reposSkipped: 0,
        reposClaimedElsewhere: 0,
        reposAlreadyProcessed: 0,
        reposExhausted: 0,
        reposDeferredByClaim: 0,
        reposCandidateMissing: 0,
        reposCandidateStateFailed: 0,
        reposFailed: 0,
        reposRateLimited: 0,
        reposUnauthorized: 0,
        skillsUpserted: 0,
        revisionsInserted: 0,
        activityEmitted: 0,
      }
      const failures: { owner: string, repo: string, reason?: string }[] = []

      for (const result of settled) {
        if (result.status === 'rejected') {
          summary.reposFailed += 1
          continue
        }
        const work = result.value
        if (work._tag === 'candidate_finish_stale') {
          summary.reposCandidateStateFailed += 1
          summary.reposFailed += 1
          failures.push({ owner: work.owner, repo: work.repo, reason: 'stale_candidate_finish' })
          continue
        }
        if (work._tag === 'claim_unavailable') {
          const classification = classifyDiscoveryClaimUnavailable(work.claim)
          if (classification._tag === 'active_claim')
            summary.reposClaimedElsewhere += 1
          else if (classification._tag === 'complete')
            summary.reposAlreadyProcessed += 1
          else if (classification._tag === 'exhausted')
            summary.reposExhausted += 1
          else if (classification._tag === 'not_due')
            summary.reposDeferredByClaim += 1
          else if (classification._tag === 'missing')
            summary.reposCandidateMissing += 1
          else
            summary.reposCandidateStateFailed += 1
          if (classification.alertable) {
            summary.reposFailed += 1
            failures.push({
              owner: work.owner,
              repo: work.repo,
              reason: classification._tag === 'missing' ? 'candidate_missing' : 'candidate_state_changed',
            })
          }
          continue
        }
        const stats = work.stats
        if (stats.status === 'indexed') {
          summary.reposIndexed += 1
          summary.skillsUpserted += stats.skillsUpserted
          summary.revisionsInserted += stats.revisionsInserted
          summary.activityEmitted += stats.activityEmitted
        }
        else if (stats.status === 'verified-only') {
          summary.reposVerifiedOnly += 1
        }
        else if (stats.status === 'rejected') {
          summary.reposFailed += 1
          failures.push({ owner: stats.owner, repo: stats.repo, reason: stats.reason })
        }
        else if (stats.status === 'failed') {
          summary.reposFailed += 1
          failures.push({ owner: stats.owner, repo: stats.repo, reason: stats.reason })
        }
        else if (stats.status === 'rate-limited') {
          summary.reposRateLimited += 1
        }
        else if (stats.status === 'unauthorized') {
          summary.reposUnauthorized += 1
        }
        else {
          summary.reposSkipped += 1
        }
      }

      const elapsedMs = Date.now() - startedAt
      const lowestRemainingDisplay = lowestRemaining === Number.POSITIVE_INFINITY ? null : lowestRemaining
      console.warn(
        `[sync-github-skills] done in ${elapsedMs}ms ratelimit-low=${lowestRemainingDisplay}`,
        summary,
      )
      if (failures.length)
        console.warn('[sync-github-skills] failures', failures)

      // A rejected credential is reported on its own so the operator sees the
      // cause instead of a failure count that names ten innocent repositories.
      const status = summary.reposUnauthorized > 0
        ? 'error'
        : summary.reposFailed > 0 || summary.reposRateLimited > 0
          ? (summary.reposIndexed > 0 || summary.reposVerifiedOnly > 0 ? 'partial' : 'error')
          : 'ok'
      const error = summary.reposUnauthorized > 0
        ? 'github credential rejected (401): rotate GITHUB_TOKEN'
        : status === 'ok'
          ? null
          : `failed=${summary.reposFailed} rate-limited=${summary.reposRateLimited}`
      await reportJobRun(db, 'sync-github-skills', {
        cron: CRON,
        status,
        durationMs: elapsedMs,
        error,
      })

      return { result: { ...summary, elapsedMs, rateLimitLowest: lowestRemainingDisplay, failures } }
    })
  },
})
