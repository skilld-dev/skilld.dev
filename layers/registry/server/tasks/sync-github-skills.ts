import type { SyncRepoStats } from '~~/layers/registry/server/utils/sync-repo'
/// <reference types="@cloudflare/workers-types" />
import { resolveGithubBindings } from '~~/layers/registry/server/utils/github-client'
import { pAll } from '~~/server/utils/p-all'
import { syncRepo } from '~~/layers/registry/server/utils/sync-repo'

const CONCURRENCY = 8
const RATE_LIMIT_GUARD = 200 // bail when remaining drops below this

/**
 * Scheduled task: walk every (owner, repo) pair present in the skills table,
 * sync skills + revisions + activity. Prioritises the stalest repos first
 * (using last_synced_at as a natural cursor), runs CONCURRENCY repos in
 * parallel, and bails cleanly when the GitHub rate-limit headroom drops
 * below RATE_LIMIT_GUARD so the next cycle can pick up where it stopped.
 *
 * Iteration source is the skills table, not `officialRepos`; that list is
 * the curated featured/badge set, while the sync target is whatever has
 * skills in D1 (seeded ~1.4k repos, plus anything ingested later).
 */
export default defineTask({
  meta: {
    name: 'sync-github-skills',
    description: 'Sync skills, revisions, and activity from GitHub for every repo with skills in D1',
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

    // Stalest first; NULL last_synced_at sorts as 0 so unsynced repos lead.
    // Filter out broken-only repos (every skill flagged broken_since) so we
    // don't keep retrying repos that have been removed/renamed upstream.
    const stalenessRows = await db
      .prepare(
        `SELECT owner, repo, MIN(last_synced_at) AS ls
         FROM skills
         WHERE broken_since IS NULL
         GROUP BY owner, repo
         ORDER BY MIN(last_synced_at) IS NULL DESC, MIN(last_synced_at) ASC`,
      )
      .all<{ owner: string, repo: string, ls: number | null }>()

    const orderedRepos = (stalenessRows.results ?? []).map(r => ({ owner: r.owner, repo: r.repo }))

    const startedAt = Date.now()
    let aborted = false
    let lowestRemaining = Number.POSITIVE_INFINITY

    const settled = await pAll(orderedRepos, CONCURRENCY, async ({ owner, repo }) => {
      if (aborted)
        return { owner, repo, status: 'rate-limited', skillsSeen: 0, skillsUpserted: 0, revisionsInserted: 0, activityEmitted: 0, reason: 'cycle aborted' } satisfies SyncRepoStats

      let stats: SyncRepoStats
      try {
        stats = await syncRepo(owner, repo, bindings, db)
      }
      catch (err) {
        return {
          owner,
          repo,
          status: 'failed',
          skillsSeen: 0,
          skillsUpserted: 0,
          revisionsInserted: 0,
          activityEmitted: 0,
          reason: (err as Error).message,
        } satisfies SyncRepoStats
      }

      if (stats.rateLimitRemaining != null && stats.rateLimitRemaining < lowestRemaining)
        lowestRemaining = stats.rateLimitRemaining

      if (stats.status === 'rate-limited' || (stats.rateLimitRemaining != null && stats.rateLimitRemaining < RATE_LIMIT_GUARD))
        aborted = true

      return stats
    })

    const summary = {
      reposTotal: orderedRepos.length,
      reposOk: 0,
      reposSkipped: 0,
      reposFailed: 0,
      reposRateLimited: 0,
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
      const stats = result.value
      if (stats.status === 'ok') {
        summary.reposOk += 1
        summary.skillsUpserted += stats.skillsUpserted
        summary.revisionsInserted += stats.revisionsInserted
        summary.activityEmitted += stats.activityEmitted
      }
      else if (stats.status === 'failed') {
        summary.reposFailed += 1
        failures.push({ owner: stats.owner, repo: stats.repo, reason: stats.reason })
      }
      else if (stats.status === 'rate-limited') {
        summary.reposRateLimited += 1
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

    return { result: { ...summary, elapsedMs, rateLimitLowest: lowestRemainingDisplay, failures } }
  },
})
