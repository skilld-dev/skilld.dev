/// <reference types="@cloudflare/workers-types" />

import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { getTaskEnv } from '#shared/server/task-env'
import { recomputeAllSkillScores } from '../utils/recompute-scores'

const CRON = '0 3 * * *'

/**
 * Scheduled task: daily full-table recompute of SEO indexability + trust
 * scoring on the skills table. The dirty-queue drain handles targeted
 * per-skill recompute when counters move; this task is the safety net that
 * catches drift from inputs the drain doesn't watch (installs/stars/pushed_at
 * landed by sync-github-skills, official-repo list changes, override edits).
 *
 * Runs at 03:00 UTC daily, after sync-github-skills has had a full overnight
 * pass to land fresh repo metadata.
 */
export default defineScheduledTask({
  name: 'recompute-skill-scores',
  cron: '0 3 * * *',
  description: 'Full-table recompute of SEO indexability + trust scoring on skills',
  async run({ context }) {
    const env = getTaskEnv(context)
    const db = env?.DB as D1Database | undefined
    if (!db) {
      console.warn('[recompute-skill-scores] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }

    const startedAt = Date.now()
    let result: Awaited<ReturnType<typeof recomputeAllSkillScores>> | null = null
    let error: string | null = null
    try {
      result = await recomputeAllSkillScores(db)
    }
    catch (err) {
      error = (err as Error).message
    }
    const elapsedMs = Date.now() - startedAt

    const status = error ? 'error' : 'ok'
    console.warn(
      `[recompute-skill-scores] done in ${elapsedMs}ms status=${status}`,
      result ?? { error },
    )

    await reportJobRun(db, 'recompute-skill-scores', {
      cron: CRON,
      status,
      durationMs: elapsedMs,
      error,
    })

    return { result: { ...(result ?? {}), elapsedMs, error } }
  },
})
