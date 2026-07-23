/// <reference types="@cloudflare/workers-types" />

import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { runCron } from '#ai-ready/server/utils/runCron'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { getTaskEnv } from '#shared/server/task-env'

const CRON = '*/5 * * * *'

function parseBatchSize(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object')
    return undefined
  const limit = (payload as Record<string, unknown>).limit
  return typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0
    ? limit
    : undefined
}

export default defineScheduledTask({
  name: 'ai-ready:cron',
  cron: '*/5 * * * *',
  description: 'Run AI Ready indexing and IndexNow synchronization',
  async run({ context, payload }) {
    const env = getTaskEnv(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      console.warn('[ai-ready:cron] Cloudflare bindings missing')
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('ai-ready:cron'),
    }, async () => {
      const startedAt = Date.now()
      try {
        const result = await runCron(undefined, {
          batchSize: parseBatchSize(payload),
        })
        const errors = [
          ...(result.index?.errors ?? []),
          result.indexNow?.error,
          result.sitemap?.error,
        ].filter((error): error is string => typeof error === 'string' && Boolean(error))
        await reportJobRun(db, 'ai-ready:cron', {
          cron: CRON,
          status: errors.length ? 'partial' : 'ok',
          durationMs: Date.now() - startedAt,
          error: errors.length ? errors.join('; ') : null,
        })
        return { result }
      }
      catch (error) {
        await reportJobRun(db, 'ai-ready:cron', {
          cron: CRON,
          status: 'error',
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })
  },
})
