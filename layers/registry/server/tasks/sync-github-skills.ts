import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { createRegistryJobBatch } from '~~/server/utils/registry-jobs-runtime'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import {
  BROKEN_REPO_REVERIFY_SECONDS,
  STALE_SYNC_SECONDS,
  SUBSCRIBED_REPO_STALE_SECONDS,
} from '~~/server/utils/sync-thresholds'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { resolveGithubBindings } from '../utils/github-client'
import { githubSyncPermit } from '../utils/github-sync-control'
import {
  appendRepoReverificationCandidates,
  DISCOVERY_SYNC_CANDIDATES_SQL,
  GENERAL_SYNC_CANDIDATES_SQL,
  historicalDiscoveryStageCapacity,
  prioritizeRepoSyncCandidates,
  REVERIFY_BROKEN_SYNC_CANDIDATES_SQL,
  STAGE_HISTORICAL_DISCOVERY_CANDIDATES_SQL,
  SUBSCRIBED_SYNC_CANDIDATES_SQL,
} from '../utils/sync-candidates'
import { prefetchUnchangedRepos } from '../utils/sync-prefetch'

const MAX_REPOS_PER_RUN = 250
const MAX_HISTORICAL_CANDIDATES_PER_RUN = 250
const MAX_REVERIFIED_REPOS_PER_RUN = 10
const GENERAL_REPOS_RESERVE = 50
const CRON = '0 * * * *'
const CLAIM_STALE_SECONDS = 30 * 60

export default defineScheduledTask({
  name: 'sync-github-skills',
  cron: '0 * * * *',
  description: 'Queue due GitHub repositories for isolated durable synchronization',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'sync-github-skills', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('sync-github-skills'),
    }, async () => {
      const startedAt = Date.now()
      const now = Math.floor(startedAt / 1000)
      const [subRows, stalenessRows, discoveryRows, reverifyRows] = await Promise.all([
        db.prepare(SUBSCRIBED_SYNC_CANDIDATES_SQL)
          .bind(now - SUBSCRIBED_REPO_STALE_SECONDS, MAX_REPOS_PER_RUN)
          .all<{ owner: string, repo: string, ls: number | null, owner_verified: number }>(),
        db.prepare(GENERAL_SYNC_CANDIDATES_SQL)
          .bind(now - STALE_SYNC_SECONDS, MAX_REPOS_PER_RUN)
          .all<{ owner: string, repo: string, ls: number | null, owner_verified: number }>(),
        db.prepare(DISCOVERY_SYNC_CANDIDATES_SQL)
          .bind(now, now - CLAIM_STALE_SECONDS, MAX_REPOS_PER_RUN)
          .all<{ owner: string, repo: string, ls: number | null, owner_verified: number }>(),
        db.prepare(REVERIFY_BROKEN_SYNC_CANDIDATES_SQL)
          .bind(now - BROKEN_REPO_REVERIFY_SECONDS, MAX_REVERIFIED_REPOS_PER_RUN)
          .all<{ owner: string, repo: string, ls: number | null, owner_verified: number }>(),
      ])
      const subscriberCandidates = subRows.results ?? []
      const generalCandidates = stalenessRows.results ?? []
      let discoveryCandidates = discoveryRows.results ?? []
      const stageLimit = historicalDiscoveryStageCapacity(
        subscriberCandidates,
        generalCandidates,
        discoveryCandidates,
        {
          limit: MAX_REPOS_PER_RUN,
          generalReserve: GENERAL_REPOS_RESERVE,
          maxHistorical: MAX_HISTORICAL_CANDIDATES_PER_RUN,
        },
      )
      let stagedHistorical = 0
      if (stageLimit > 0) {
        const staged = await db.prepare(STAGE_HISTORICAL_DISCOVERY_CANDIDATES_SQL)
          .bind(now, stageLimit)
          .run()
        stagedHistorical = Number(staged.meta.changes ?? 0)
        if (stagedHistorical > 0) {
          const refreshedDiscovery = await db.prepare(DISCOVERY_SYNC_CANDIDATES_SQL)
            .bind(now, now - CLAIM_STALE_SECONDS, MAX_REPOS_PER_RUN)
            .all<{ owner: string, repo: string, ls: number | null, owner_verified: number }>()
          discoveryCandidates = refreshedDiscovery.results ?? []
        }
      }
      const discoveryKeys = new Set(
        discoveryCandidates.map(row => `${row.owner}/${row.repo}`),
      )
      const { ordered, deferred } = prioritizeRepoSyncCandidates(
        subscriberCandidates,
        generalCandidates,
        discoveryCandidates,
        {
          limit: MAX_REPOS_PER_RUN,
          generalReserve: GENERAL_REPOS_RESERVE,
        },
      )
      // Re-verification of long-broken repos queues last: only slots the live
      // pools left free, capped well under the run limit.
      const queue = appendRepoReverificationCandidates(
        ordered,
        reverifyRows.results ?? [],
        { limit: MAX_REPOS_PER_RUN, maxReverified: MAX_REVERIFIED_REPOS_PER_RUN },
      )

      const reverified = queue.length - ordered.length
      const candidates = queue.map(({ owner, repo, ownerVerified }) => ({
        owner,
        repo,
        ownerVerified,
        claimDiscovery: discoveryKeys.has(`${owner}/${repo}`),
      }))
      // While the sync is paused, every job would release itself unread, so
      // a prefetch would only spend the quota the pause is saving.
      const permit = await githubSyncPermit(db, now)
      const prefetch = permit._tag === 'paused'
        ? { _tag: 'unread' as const, queue: candidates, reason: 'sync-paused' }
        : await prefetchUnchangedRepos({ db, bindings: resolveGithubBindings(env), now }, candidates)
            .catch((error: unknown) => {
              // The jobs read every repository themselves, as before the
              // prefetch existed, so the run still completes.
              emitOperationalEvent(createWideEvent({
                operation: 'sync-github-skills-prefetch',
                outcome: 'failed',
                reason: error instanceof Error ? error.message : String(error),
              }))
              return { _tag: 'unread' as const, queue: candidates, reason: 'prefetch-threw' }
            })
      const prefetched = prefetch._tag === 'prefetched'
        ? { unchanged: prefetch.unchanged, graphqlRequests: prefetch.requests }
        : { unread: prefetch.reason }

      if (prefetch.queue.length === 0) {
        await reportJobRun(db, 'sync-github-skills', {
          cron: CRON,
          status: 'ok',
          durationMs: Date.now() - startedAt,
        })
        return { result: { queued: 0, deferred, stagedHistorical, reverified, prefetched } }
      }

      const batch = await createRegistryJobBatch(
        env as Cloudflare.Env & Record<string, unknown>,
        {
          name: `registry-sync:${now}`,
          jobs: prefetch.queue.map(candidate => ({ operation: 'sync' as const, ...candidate })),
        },
      )
      const dispatchFailed = batch.dispatched.filter(result => result.status !== 'sent')
      const status = dispatchFailed.length > 0 ? 'partial' : 'ok'
      const error = dispatchFailed.length > 0
        ? `${dispatchFailed.length}/${batch.dispatched.length} queue dispatches deferred to durable recovery`
        : null
      await reportJobRun(db, 'sync-github-skills', {
        cron: CRON,
        status,
        durationMs: Date.now() - startedAt,
        error,
      })
      return {
        result: {
          batchId: batch.batchId,
          queued: batch.jobIds.length,
          deferred,
          stagedHistorical,
          reverified,
          prefetched,
          dispatchFailed: dispatchFailed.length,
        },
      }
    })
  },
})
