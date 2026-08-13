import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { createRegistryJobBatch } from '~~/server/utils/registry-jobs-runtime'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'

const CRON = '*/5 * * * *'
const MAINTENANCE = 'nested-assets-v1'

interface MaintenanceRow {
  status: 'queued' | 'retry' | 'complete'
  batch_id: string | null
}

interface BatchRow {
  pending_jobs: number
  failed_jobs: number
  finished_at: number | null
}

export default defineScheduledTask({
  name: 'backfill-skill-assets',
  cron: '*/5 * * * *',
  description: 'One-off corrected nested skill asset backfill through durable repo jobs',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db)
      return { result: { error: 'no-db' } }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('backfill-skill-assets'),
    }, async () => {
      const startedAt = Date.now()
      const maintenance = await db.prepare(
        `SELECT status, batch_id
         FROM registry_maintenance
         WHERE name = ?`,
      ).bind(MAINTENANCE).first<MaintenanceRow>()
      if (maintenance?.status === 'complete') {
        await reportJobRun(db, 'backfill-skill-assets', {
          cron: CRON,
          status: 'ok',
          durationMs: Date.now() - startedAt,
        })
        return { result: { status: 'complete' } }
      }

      if (maintenance?.status === 'queued' && maintenance.batch_id) {
        const batch = await db.prepare(
          `SELECT pending_jobs, failed_jobs, finished_at
           FROM job_batches
           WHERE id = ?`,
        ).bind(maintenance.batch_id).first<BatchRow>()
        if (batch && batch.pending_jobs > 0)
          return { result: { status: 'queued', batchId: maintenance.batch_id, pending: batch.pending_jobs } }
        if (batch?.finished_at && batch.failed_jobs === 0) {
          await db.prepare(
            `UPDATE registry_maintenance
             SET status = 'complete', updated_at = ?, last_error = NULL
             WHERE name = ?`,
          ).bind(Math.floor(Date.now() / 1000), MAINTENANCE).run()
          await reportJobRun(db, 'backfill-skill-assets', {
            cron: CRON,
            status: 'ok',
            durationMs: Date.now() - startedAt,
          })
          return { result: { status: 'complete', batchId: maintenance.batch_id } }
        }
        await db.prepare(
          `UPDATE registry_maintenance
           SET status = 'retry', updated_at = ?, last_error = ?
           WHERE name = ?`,
        ).bind(
          Math.floor(Date.now() / 1000),
          batch ? `${batch.failed_jobs} asset jobs failed` : 'asset batch row missing',
          MAINTENANCE,
        ).run()
      }

      const candidates = await db.prepare(
        `SELECT DISTINCT s.owner, s.repo
         FROM skills s
         JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         WHERE s.rendered_skill_path GLOB '*/*/SKILL.md'
           AND s.references_count = 0
           AND r.broken_since IS NULL
         ORDER BY s.owner, s.repo`,
      ).all<{ owner: string, repo: string }>()
      const repos = candidates.results ?? []
      if (repos.length === 0) {
        await db.prepare(
          `INSERT INTO registry_maintenance (name, status, batch_id, updated_at, last_error)
           VALUES (?, 'complete', NULL, ?, NULL)
           ON CONFLICT(name) DO UPDATE SET
             status = 'complete',
             batch_id = NULL,
             updated_at = excluded.updated_at,
             last_error = NULL`,
        ).bind(MAINTENANCE, Math.floor(Date.now() / 1000)).run()
        await reportJobRun(db, 'backfill-skill-assets', {
          cron: CRON,
          status: 'ok',
          durationMs: Date.now() - startedAt,
        })
        return { result: { status: 'complete', queued: 0 } }
      }

      const batch = await createRegistryJobBatch(
        env as Cloudflare.Env & Record<string, unknown>,
        {
          name: `asset-backfill:${MAINTENANCE}`,
          jobs: repos.map(({ owner, repo }) => ({ operation: 'assets', owner, repo })),
        },
      )
      await db.prepare(
        `INSERT INTO registry_maintenance (name, status, batch_id, updated_at, last_error)
         VALUES (?, 'queued', ?, ?, NULL)
         ON CONFLICT(name) DO UPDATE SET
           status = 'queued',
           batch_id = excluded.batch_id,
           updated_at = excluded.updated_at,
           last_error = NULL`,
      ).bind(MAINTENANCE, batch.batchId, Math.floor(Date.now() / 1000)).run()
      await reportJobRun(db, 'backfill-skill-assets', {
        cron: CRON,
        status: batch.dispatched.every(result => result.status === 'sent') ? 'ok' : 'partial',
        durationMs: Date.now() - startedAt,
        error: batch.dispatched.every(result => result.status === 'sent')
          ? null
          : 'queue dispatch deferred to durable recovery',
      })
      return { result: { status: 'queued', batchId: batch.batchId, queued: repos.length } }
    })
  },
})
