/// <reference types="@cloudflare/workers-types" />
import { resolveGithubBindings } from '~~/layers/registry/server/utils/github-client'
import { syncRepo } from '~~/layers/registry/server/utils/sync-repo'

const BATCH = 50
const STALE_AFTER_SECONDS = 6 * 60 * 60

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
export default defineTask({
  meta: {
    name: 'reconcile-rendered',
    description: 'Re-sync skills with non-ok rendered_status that have gone stale',
  },
  async run({ context }) {
    const env = (context as Record<string, any>).cloudflare?.env as Record<string, unknown> | undefined
    const db = env?.DB as D1Database | undefined
    if (!db) {
      console.warn('[reconcile-rendered] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }

    const cutoff = Math.floor(Date.now() / 1000) - STALE_AFTER_SECONDS
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
    return { result: { reconciled: ok, failed, scanned: repos.length } }
  },
})
