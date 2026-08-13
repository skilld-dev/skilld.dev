/**
 * Scan tracked repos for unusual star growth and record what it finds.
 *
 * Reads only `repo_star_observations`, which metadata sync already fills, so
 * this costs D1 reads and no GitHub API calls. The judgement itself is the
 * pure `detectStarSurge`; this module is the shell that loads series, writes
 * verdicts, and reports what happened.
 */

import type { StarObservationPoint, StarSurgeConfig } from '#shared/star-surge'
import { DEFAULT_STAR_SURGE_CONFIG, detectStarSurge } from '#shared/star-surge'

/**
 * Repos examined per run. Comfortably above the whole registry (11,451 tracked
 * repos as of 2026-08-13), because a cap set below it silently skips the
 * remainder. It exists only as a runaway backstop, and the task logs loudly if
 * it is ever reached.
 */
export const DEFAULT_SCAN_LIMIT = 50_000

/**
 * Observation rows fetched per page. Sized so one query stays small even for
 * repos carrying a full baseline window of daily points.
 */
const OBSERVATION_PAGE_ROWS = 5000

export interface StarSurgeScanDeps {
  db: D1Database
  /** Unix seconds. */
  now: number
  limit?: number
  config?: StarSurgeConfig
}

export interface StarSurgeScanSummary {
  reposScanned: number
  surges: number
  recorded: number
  insufficientHistory: number
  /** True when the scan ceiling stopped it before every repo was examined. */
  truncated: boolean
  elapsedMs: number
}

interface ObservationRow {
  owner: string
  repo: string
  observed_day: number
  stars: number
}

export async function scanStarSurges(deps: StarSurgeScanDeps): Promise<StarSurgeScanSummary> {
  const startedAt = Date.now()
  const { db, now } = deps
  const config = deps.config ?? DEFAULT_STAR_SURGE_CONFIG
  const limit = deps.limit ?? DEFAULT_SCAN_LIMIT

  // Only the baseline window is loaded. Older observations cannot change a
  // median that ignores them, and pulling 90 days per repo would multiply the
  // read volume for no change in the answer.
  const windowStart = now - (config.baselineDays + 2) * 86_400
  const windowStartDay = Math.floor(windowStart / 86_400) * 86_400

  const summary: StarSurgeScanSummary = {
    reposScanned: 0,
    surges: 0,
    recorded: 0,
    insufficientHistory: 0,
    truncated: false,
    elapsedMs: 0,
  }

  const statements: D1PreparedStatement[] = []

  // Walked in repo-sized pages rather than loaded whole.
  //
  // A single unbounded read looked fine until it met the real registry: 11,451
  // tracked repos across a two-week window is on the order of 170,000 rows in
  // one result set, and the earlier flat cap silently examined the first 5,000
  // repos and skipped the rest. Keyset pagination on (owner, repo) bounds the
  // memory per query without bounding how much of the registry gets judged.
  let cursor: { owner: string, repo: string } | null = null

  while (summary.reposScanned < limit) {
    // Annotated because `cursor` is both read into this query and written
    // from its result, which leaves TypeScript inferring the page type from
    // itself.
    const page: ObservationRow[] = (await db
      .prepare(
        `SELECT owner, repo, observed_day, stars
         FROM repo_star_observations
         WHERE observed_day >= ?1
           AND (?2 IS NULL OR (owner, repo) > (?2, ?3))
         ORDER BY owner, repo, observed_day
         LIMIT ?4`,
      )
      .bind(windowStartDay, cursor?.owner ?? null, cursor?.repo ?? '', OBSERVATION_PAGE_ROWS)
      .all<ObservationRow>()).results ?? []

    if (page.length === 0)
      break

    const byRepo = new Map<string, { owner: string, repo: string, points: StarObservationPoint[] }>()
    for (const row of page) {
      const key = `${row.owner}/${row.repo}`
      let entry = byRepo.get(key)
      if (!entry) {
        entry = { owner: row.owner, repo: row.repo, points: [] }
        byRepo.set(key, entry)
      }
      entry.points.push({ observedDay: row.observed_day, stars: row.stars })
    }

    const entries = [...byRepo.values()]
    const last = page.at(-1)!
    const morePages = page.length === OBSERVATION_PAGE_ROWS

    // The final repo in a full page is probably cut in half by the row limit,
    // so it is dropped here and picked up whole by the next page. Judging a
    // truncated series would read its missing days as a flat baseline.
    const judgeable = morePages && entries.length > 1 ? entries.slice(0, -1) : entries
    cursor = morePages
      ? { owner: judgeable.at(-1)!.owner, repo: judgeable.at(-1)!.repo }
      : { owner: last.owner, repo: last.repo }

    for (const entry of judgeable) {
      if (summary.reposScanned >= limit) {
        summary.truncated = true
        break
      }
      summary.reposScanned += 1
      const verdict = detectStarSurge(entry.points, config)

      if (verdict._tag === 'insufficient-history') {
        summary.insufficientHistory += 1
        continue
      }
      if (verdict._tag !== 'surge')
        continue

      summary.surges += 1
      statements.push(
        db.prepare(
          `INSERT INTO repo_star_surges (
             owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT (owner, repo, observed_day) DO UPDATE SET
             latest_gain = excluded.latest_gain,
             baseline_gain = excluded.baseline_gain,
             stars = excluded.stars,
             detected_at = excluded.detected_at`,
        ).bind(
          entry.owner,
          entry.repo,
          verdict.observedDay,
          Math.round(verdict.latestGain),
          Math.round(verdict.baselineGain),
          verdict.stars,
          now,
        ),
      )
    }

    if (!morePages)
      break
  }

  for (let i = 0; i < statements.length; i += 20)
    await db.batch(statements.slice(i, i + 20))
  summary.recorded = statements.length

  summary.elapsedMs = Date.now() - startedAt
  return summary
}

export interface SurgingRepo {
  owner: string
  repo: string
  latestGain: number
  baselineGain: number
  stars: number
  observedDay: number
}

/**
 * Repos that surged within the last `days`, strongest first.
 *
 * Deduplicated to one row per repo: a repo climbing for three days running is
 * one story, and listing it three times would crowd out everything else.
 */
export async function loadSurgingRepos(input: {
  db: D1Database
  now: number
  days?: number
  limit?: number
  /** Restrict to repos with at least one indexed skill, for public surfaces. */
  indexedOnly?: boolean
}): Promise<SurgingRepo[]> {
  const days = input.days ?? 3
  const cutoff = Math.floor((input.now - days * 86_400) / 86_400) * 86_400

  const rows = (await input.db
    .prepare(
      `SELECT s.owner, s.repo, s.latest_gain, s.baseline_gain, s.stars, s.observed_day
       FROM repo_star_surges s
       WHERE s.observed_day >= ?1
         AND s.observed_day = (
           SELECT MAX(t.observed_day) FROM repo_star_surges t
           WHERE t.owner = s.owner AND t.repo = s.repo AND t.observed_day >= ?1
         )
         ${input.indexedOnly
      ? `AND EXISTS (
                SELECT 1 FROM skills k
                WHERE k.owner = s.owner AND k.repo = s.repo AND k.source_resolved = 1
              )`
      : ''}
       ORDER BY s.latest_gain DESC
       LIMIT ?2`,
    )
    .bind(cutoff, input.limit ?? 10)
    .all<{
    owner: string
    repo: string
    latest_gain: number
    baseline_gain: number
    stars: number
    observed_day: number
  }>()).results ?? []

  return rows.map(r => ({
    owner: r.owner,
    repo: r.repo,
    latestGain: r.latest_gain,
    baselineGain: r.baseline_gain,
    stars: r.stars,
    observedDay: r.observed_day,
  }))
}
