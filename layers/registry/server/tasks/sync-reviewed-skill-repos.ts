import { createRegistryReviewJobBatch } from '~~/server/utils/registry-jobs-runtime'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { getTaskEnv } from '#shared/server/task-env'

const BATCH_SIZE = 50
const CRON = '*/5 * * * *'

export default defineScheduledTask({
  name: 'sync-reviewed-skill-repos',
  cron: '*/5 * * * *',
  description: 'Dispatch editorially approved skill repositories through the priority sync queue',
  async run({ context }) {
    const env = getTaskEnv(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      console.warn('[sync-reviewed-skill-repos] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('sync-reviewed-skill-repos'),
    }, async () => {
      const startedAt = Date.now()
      const result = await db.prepare(`
        SELECT outbox.owner, outbox.repo, outbox.claim_discovery
        FROM skill_repo_review_sync_outbox AS outbox
        JOIN skill_repo_eligibility AS review
          ON review.owner = outbox.owner
         AND review.repo = outbox.repo
         AND review.status = 'eligible'
        ORDER BY outbox.queued_at, outbox.owner, outbox.repo
        LIMIT ?
      `).bind(BATCH_SIZE).all<{ owner: string, repo: string, claim_discovery: number }>()
      const repos = result.results ?? []

      if (repos.length === 0) {
        await reportJobRun(db, 'sync-reviewed-skill-repos', {
          cron: CRON,
          status: 'ok',
          durationMs: Date.now() - startedAt,
        })
        return { result: { queued: 0 } }
      }

      const batch = await createRegistryReviewJobBatch(
        env as Cloudflare.Env & Record<string, unknown>,
        {
          name: `reviewed-skill-repos:${Math.floor(startedAt / 1000)}`,
          jobs: repos.map(({ owner, repo, claim_discovery }) => ({
            operation: 'sync',
            owner,
            repo,
            ownerVerified: false,
            claimDiscovery: claim_discovery === 1,
          })),
        },
      )

      await db.batch(repos.map(({ owner, repo }) => db.prepare(`
        DELETE FROM skill_repo_review_sync_outbox
        WHERE owner = ? AND repo = ?
      `).bind(owner, repo)))

      const deferred = batch.dispatched.filter(dispatch => dispatch.status !== 'sent').length
      await reportJobRun(db, 'sync-reviewed-skill-repos', {
        cron: CRON,
        status: deferred > 0 ? 'partial' : 'ok',
        durationMs: Date.now() - startedAt,
        error: deferred > 0
          ? `${deferred}/${repos.length} queue dispatches deferred to durable recovery`
          : null,
      })

      return {
        result: {
          batchId: batch.batchId,
          queued: repos.length,
          deferred,
        },
      }
    })
  },
})
