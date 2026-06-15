import type { SyncRepoStats } from '../utils/sync-repo'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { SUBSCRIBED_REPO_STALE_SECONDS } from '~~/server/utils/sync-thresholds'
import { pAll } from '#shared/server/p-all'
/// <reference types="@cloudflare/workers-types" />
import { resolveGithubBindings } from '../utils/github-client'
import { syncRepo } from '../utils/sync-repo'

const CONCURRENCY = 8
const RATE_LIMIT_GUARD = 200 // bail when remaining drops below this
// Cloudflare Workers cap outbound subrequests at 1000 per invocation
// AND scheduled handlers have CPU time limits. GraphQL JSON parsing per
// repo is heavier than REST per-call (one big payload vs many small),
// so subrequest-cap headroom doesn't translate to CPU headroom. 500 hit
// outcome=exceededCpu in production; 250 leaves margin even at the
// raised 5min CPU ceiling.
const MAX_REPOS_PER_RUN = 250
const CRON = '0 * * * *'

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

    // Phase 3: subscription-prioritised pre-pass. Repos that any user
    // watches and whose stalest skill is > SUBSCRIBED_REPO_STALE_SECONDS old
    // jump the queue so the weekly digest reflects fresh activity. The
    // general staleness pass picks up the rest after.
    const subRows = await db
      .prepare(
        // broken_since lives on `repos` post-0034; gate by joining repos so
        // we skip whole repos that GitHub returned 404 for, while still using
        // skills.last_synced_at to measure staleness per-row.
        `SELECT s.owner, s.repo, MIN(s.last_synced_at) AS ls
         FROM skills s
         JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         JOIN skill_subscriptions sub
           ON sub.owner = s.owner AND sub.repo = s.repo
         WHERE r.broken_since IS NULL
         GROUP BY s.owner, s.repo
         HAVING MIN(s.last_synced_at) IS NULL OR MIN(s.last_synced_at) < ?1
         ORDER BY MIN(s.last_synced_at) IS NULL DESC, MIN(s.last_synced_at) ASC`,
      )
      .bind(Math.floor(Date.now() / 1000) - SUBSCRIBED_REPO_STALE_SECONDS)
      .all<{ owner: string, repo: string, ls: number | null }>()

    // Stalest first; NULL last_synced_at sorts as 0 so unsynced repos lead.
    // Filter out broken-only repos (every skill flagged broken_since) so we
    // don't keep retrying repos that have been removed/renamed upstream.
    const stalenessRows = await db
      .prepare(
        `SELECT s.owner, s.repo, MIN(s.last_synced_at) AS ls
         FROM skills s
         JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         WHERE r.broken_since IS NULL
         GROUP BY s.owner, s.repo
         ORDER BY MIN(s.last_synced_at) IS NULL DESC, MIN(s.last_synced_at) ASC`,
      )
      .all<{ owner: string, repo: string, ls: number | null }>()

    // Dedupe: subscribed repos run first, then everything else.
    const subscribed = (subRows.results ?? []).map(r => ({ owner: r.owner, repo: r.repo }))
    const seen = new Set(subscribed.map(r => `${r.owner}/${r.repo}`))
    const rest = (stalenessRows.results ?? [])
      .map(r => ({ owner: r.owner, repo: r.repo }))
      .filter(r => !seen.has(`${r.owner}/${r.repo}`))
    const fullOrder = [...subscribed, ...rest]
    const orderedRepos = fullOrder.slice(0, MAX_REPOS_PER_RUN)
    const deferred = fullOrder.length - orderedRepos.length

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
      reposDeferred: deferred,
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

    const status = summary.reposFailed > 0 || summary.reposRateLimited > 0
      ? (summary.reposOk > 0 ? 'partial' : 'error')
      : 'ok'
    await reportJobRun(db, 'sync-github-skills', {
      cron: CRON,
      status,
      durationMs: elapsedMs,
      error: status === 'ok' ? null : `failed=${summary.reposFailed} rate-limited=${summary.reposRateLimited}`,
    })

    return { result: { ...summary, elapsedMs, rateLimitLowest: lowestRemainingDisplay, failures } }
  },
})
