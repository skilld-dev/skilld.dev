import { createRegistryJobBatch } from '~~/server/utils/registry-jobs-runtime'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { STALE_SYNC_SECONDS, SUBSCRIBED_REPO_STALE_SECONDS } from '~~/server/utils/sync-thresholds'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { getTaskEnv } from '#shared/server/task-env'
import {
  DISCOVERY_SYNC_CANDIDATES_SQL,
  GENERAL_SYNC_CANDIDATES_SQL,
  prioritizeRepoSyncCandidates,
  SUBSCRIBED_SYNC_CANDIDATES_SQL,
} from '../utils/sync-candidates'

const MAX_REPOS_PER_RUN = 250
const CRON = '0 * * * *'
const CLAIM_STALE_SECONDS = 30 * 60

export default defineScheduledTask({
  name: 'sync-github-skills',
  cron: '0 * * * *',
  description: 'Queue due GitHub repositories for isolated durable synchronization',
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
      const startedAt = Date.now()
      const now = Math.floor(startedAt / 1000)
      const [subRows, stalenessRows, discoveryRows] = await Promise.all([
        db.prepare(SUBSCRIBED_SYNC_CANDIDATES_SQL)
          .bind(now - SUBSCRIBED_REPO_STALE_SECONDS)
          .all<{ owner: string, repo: string, ls: number | null, owner_verified: number }>(),
        db.prepare(GENERAL_SYNC_CANDIDATES_SQL)
          .bind(now - STALE_SYNC_SECONDS)
          .all<{ owner: string, repo: string, ls: number | null, owner_verified: number }>(),
        db.prepare(DISCOVERY_SYNC_CANDIDATES_SQL)
          .bind(now, now - CLAIM_STALE_SECONDS)
          .all<{ owner: string, repo: string, ls: number | null, owner_verified: number }>(),
      ])
      const discoveryKeys = new Set(
        (discoveryRows.results ?? []).map(row => `${row.owner}/${row.repo}`),
      )
      const { ordered, deferred } = prioritizeRepoSyncCandidates(
        subRows.results ?? [],
        stalenessRows.results ?? [],
        discoveryRows.results ?? [],
        MAX_REPOS_PER_RUN,
      )

      if (ordered.length === 0) {
        await reportJobRun(db, 'sync-github-skills', {
          cron: CRON,
          status: 'ok',
          durationMs: Date.now() - startedAt,
        })
        return { result: { queued: 0, deferred } }
      }

      const batch = await createRegistryJobBatch(
        env as Cloudflare.Env & Record<string, unknown>,
        {
          name: `registry-sync:${now}`,
          jobs: ordered.map(({ owner, repo, ownerVerified }) => ({
            operation: 'sync',
            owner,
            repo,
            ownerVerified,
            claimDiscovery: discoveryKeys.has(`${owner}/${repo}`),
          })),
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
          dispatchFailed: dispatchFailed.length,
        },
      }
    })
  },
})
