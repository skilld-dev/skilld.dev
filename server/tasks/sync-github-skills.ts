import type { SyncRepoStats } from '../utils/sync-repo'
/// <reference types="@cloudflare/workers-types" />
import { officialRepos } from '../data/official-repos'
import { resolveGithubBindings } from '../utils/github-client'
import { syncRepo } from '../utils/sync-repo'

/**
 * Scheduled task: walk every repo in officialRepos, sync skills + revisions
 * + activity. Self-throttling via ETag short-circuit and pushed_at / tree.sha
 * skip paths in syncRepo. Reads GITHUB_TOKEN from Worker env or process.env.
 */
export default defineTask({
  meta: {
    name: 'sync-github-skills',
    description: 'Sync skills, revisions, and activity from GitHub for every official repo',
  },
  async run({ context }) {
    const env = (context as Record<string, any>).cloudflare?.env as Record<string, unknown> | undefined
    const db = env?.DB as D1Database | undefined
    if (!db) {
      console.warn('[sync-github-skills] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }

    const bindings = resolveGithubBindings(env)
    if (!bindings.GITHUB_TOKEN) {
      console.warn('[sync-github-skills] GITHUB_TOKEN not configured; running unauthenticated (60/hr cap)')
    }

    const startedAt = Date.now()
    const summary = {
      reposTotal: officialRepos.length,
      reposOk: 0,
      reposSkipped: 0,
      reposFailed: 0,
      skillsUpserted: 0,
      revisionsInserted: 0,
      activityEmitted: 0,
    }
    const failures: { owner: string, repo: string, reason?: string }[] = []

    for (const { owner, repo } of officialRepos) {
      let stats: SyncRepoStats
      try {
        stats = await syncRepo(owner, repo, bindings, db)
      }
      catch (err) {
        const reason = (err as Error).message
        console.warn(`[sync-github-skills] ${owner}/${repo} threw: ${reason}`)
        summary.reposFailed += 1
        failures.push({ owner, repo, reason })
        continue
      }

      if (stats.status === 'ok') {
        summary.reposOk += 1
        summary.skillsUpserted += stats.skillsUpserted
        summary.revisionsInserted += stats.revisionsInserted
        summary.activityEmitted += stats.activityEmitted
      }
      else if (stats.status === 'failed') {
        summary.reposFailed += 1
        failures.push({ owner, repo, reason: stats.reason })
      }
      else {
        summary.reposSkipped += 1
      }
    }

    const elapsedMs = Date.now() - startedAt
    console.warn(`[sync-github-skills] done in ${elapsedMs}ms`, summary)
    if (failures.length)
      console.warn('[sync-github-skills] failures', failures)

    return { result: { ...summary, elapsedMs, failures } }
  },
})
