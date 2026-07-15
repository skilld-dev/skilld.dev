import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { RECONCILE_RENDER_STALE_SECONDS } from '~~/server/utils/sync-thresholds'
import { getTaskEnv } from '#shared/server/task-env'
/// <reference types="@cloudflare/workers-types" />
import { resolveGithubBindings } from '../utils/github-client'
import { syncRepo } from '../utils/sync-repo'

const BATCH = 50
const CRON = '20 */6 * * *'

/**
 * Periodically re-sync skills whose last render failed (path_missing or
 * fetch_failed) and haven't been touched in 6h+. The hot-path detail handler
 * does a live render fallback on the first cold visit, but rows that never
 * get visited again stay broken in cache. This task picks a small batch per
 * run, groups by (owner, repo), and replays syncRepo on each — which rewrites
 * rendered_skill_path, rendered_status, rendered_raw, rendered_frontmatter,
 * rendered_html, rendered_at as a side effect.
 *
 * Kept to N=50/run so it doesn't dominate the hourly cron budget alongside
 * sync-github-skills and send-digests.
 */
export default defineScheduledTask({
  name: 'reconcile-rendered',
  cron: '20 */6 * * *',
  description: 'Re-sync skills with non-ok rendered_status that have gone stale',
  async run({ context }) {
    const env = getTaskEnv(context)
    const db = env?.DB as D1Database | undefined
    if (!db) {
      console.warn('[reconcile-rendered] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }

    const startedAt = Date.now()
    const cutoff = Math.floor(Date.now() / 1000) - RECONCILE_RENDER_STALE_SECONDS
    const res = await db
      .prepare(
        `SELECT DISTINCT s.owner, s.repo
         FROM skills s
         JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         WHERE s.rendered_status IN ('path_missing', 'fetch_failed')
           AND (s.last_synced_at IS NULL OR s.last_synced_at < ?1)
           AND r.broken_since IS NULL
         ORDER BY s.last_synced_at IS NULL DESC, s.last_synced_at ASC
         LIMIT ?2`,
      )
      .bind(cutoff, BATCH)
      .all<{ owner: string, repo: string }>()

    const repos = res.results ?? []
    if (!repos.length) {
      await reportJobRun(db, 'reconcile-rendered', { cron: CRON, status: 'ok', durationMs: Date.now() - startedAt })
      return { result: { reconciled: 0 } }
    }

    const bindings = resolveGithubBindings(env)
    let ok = 0
    let failed = 0
    for (const { owner, repo } of repos) {
      const result = await syncRepo(owner, repo, bindings, db).catch((err) => {
        console.warn(`[reconcile-rendered] sync ${owner}/${repo} failed:`, err)
        return null
      })
      if (result)
        ok++
      else
        failed++
    }
    await reportJobRun(db, 'reconcile-rendered', {
      cron: CRON,
      status: failed > 0 ? (ok > 0 ? 'partial' : 'error') : 'ok',
      durationMs: Date.now() - startedAt,
      error: failed > 0 ? `${failed}/${repos.length} repos failed` : null,
    })
    return { result: { reconciled: ok, failed, scanned: repos.length } }
  },
})
