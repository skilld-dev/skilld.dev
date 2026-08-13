/// <reference types="@cloudflare/workers-types" />

import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { createDiscordNotifier } from '#shared/server/discord-notify'
import { loadSurgingRepos, scanStarSurges } from '#shared/server/star-surge-scan'

const CRON = '30 4 * * *'

/**
 * Daily scan for repos whose star count jumped.
 *
 * The second trend signal, independent of X. A repo can climb hard on GitHub
 * with nobody posting about it, and that is the same question the trending
 * page asks, put to a source we already record.
 *
 * Costs nothing external: `repo_star_observations` is filled by the existing
 * metadata sync, so this reads D1 and calls no API. It runs at 04:30 UTC, well
 * after the nightly sync at 03:00, so it judges the day that just closed.
 */
export default defineScheduledTask({
  name: 'detect-star-surges',
  cron: '30 4 * * *',
  description: 'Find tracked repos whose star growth jumped, and announce the strongest',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      console.warn('[detect-star-surges] D1 binding not available')
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('detect-star-surges'),
    }, async () => {
      const startedAt = Date.now()
      const now = Math.floor(startedAt / 1000)

      const scan = await scanStarSurges({ db, now })
      if (scan.truncated)
        console.warn('[detect-star-surges] scan ceiling reached; some repos were not examined')

      const announced = await announceSurges(db, env, now)

      const summary = {
        reposScanned: scan.reposScanned,
        surges: scan.surges,
        recorded: scan.recorded,
        insufficientHistory: scan.insufficientHistory,
        truncated: scan.truncated,
        announced,
        elapsedMs: Date.now() - startedAt,
      }

      console.warn('[detect-star-surges] done', summary)
      await reportJobRun(db, 'detect-star-surges', {
        cron: CRON,
        status: 'ok',
        durationMs: summary.elapsedMs,
      })
      return { result: summary }
    })
  },
})

/**
 * Announce today's surges that have not been announced before.
 *
 * `announced_at` is per (repo, day), so a repo climbing for a week is reported
 * on each new day it clears the bar rather than repeatedly for the same day.
 */
async function announceSurges(
  db: D1Database,
  env: Cloudflare.Env & Record<string, unknown>,
  now: number,
): Promise<number> {
  const webhookUrl = (env as unknown as { DISCORD_WEBHOOK_URL?: string }).DISCORD_WEBHOOK_URL
  if (!webhookUrl)
    return 0

  const pending = (await db
    .prepare(
      `SELECT owner, repo, observed_day, latest_gain, baseline_gain, stars
       FROM repo_star_surges
       WHERE announced_at IS NULL
       ORDER BY latest_gain DESC
       LIMIT 10`,
    )
    .all<{
    owner: string
    repo: string
    observed_day: number
    latest_gain: number
    baseline_gain: number
    stars: number
  }>()).results ?? []

  if (pending.length === 0)
    return 0

  const notifier = createDiscordNotifier({ webhookUrl })
  const result = await notifier.trendingRepos(pending.map(row => ({
    owner: row.owner,
    repo: row.repo,
    evidenceUrl: `https://github.com/${row.owner}/${row.repo}/stargazers`,
    evidenceText: `Gained ${row.latest_gain} stars in a day against a usual ${row.baseline_gain}. Now at ${row.stars}.`,
    // Star growth has no post behind it, so the engagement fields stay at zero
    // rather than borrowing numbers that would read as X activity.
    favouriteCount: 0,
    bookmarkCount: 0,
    authorHandle: row.owner,
    skillCount: 0,
    skilldUrl: `https://skilld.dev/gh/${row.owner}/${row.repo}`,
  })))

  if (result._tag !== 'sent') {
    // Left unannounced so the next run retries.
    console.warn('[detect-star-surges] discord notify not sent', result)
    return 0
  }

  for (const row of pending) {
    await db
      .prepare(
        `UPDATE repo_star_surges SET announced_at = ?3
         WHERE owner = ?1 AND repo = ?2 AND observed_day = ?4`,
      )
      .bind(row.owner, row.repo, now, row.observed_day)
      .run()
  }

  // Surfaced for the operator: loadSurgingRepos is what the page reads, and a
  // mismatch between announced and visible is worth noticing early.
  const visible = await loadSurgingRepos({ db, now, indexedOnly: true })
  console.warn(`[detect-star-surges] ${visible.length} surging repos are publicly visible`)

  return pending.length
}
