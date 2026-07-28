/// <reference types="@cloudflare/workers-types" />

import type { TokenExpiryStatus } from '#layers/registry/server/utils/github-token-expiry'
import type { LatestScheduledRun, ScheduleHealth } from '#shared/schedule-policy'
import type { SendEmailInput, SendEmailResult } from './email'
import { TERMINAL_DISCOVERY_REJECTION_REASONS } from '#layers/registry/server/utils/discovery-candidates'
import { parseTokenExpiry, tokenExpiryStatus } from '#layers/registry/server/utils/github-token-expiry'
import { evaluateScheduleHealth, SCHEDULE_POLICY } from '#shared/schedule-policy'

const MELBOURNE_TIME_ZONE = 'Australia/Melbourne'
const DAY_SECONDS = 24 * 60 * 60
const DAY_MS = DAY_SECONDS * 1000
const AI_STUCK_SECONDS = 3 * 60 * 60
const DIRTY_STUCK_SECONDS = 60 * 60
const RESERVED_STUCK_SECONDS = 15 * 60
const CLAIM_STALE_SECONDS = 60 * 60

export type DailyHealthStatus = 'GREEN' | 'AMBER' | 'RED'

export interface DailyHealthCheckSummary {
  status: DailyHealthStatus
  reasons: string[]
  warnings: string[]
  window: {
    reportDate: string
    timeZone: string
    from: string
    to: string
    workerVersion: string | null
  }
  frontDoor: {
    checks: Array<{ url: string, status: number | null }>
  }
  inventory: {
    skills: number
    repos: number
    owners: number
    users: number
    collections: number
    watchedRepos: number
    brokenRepos: number
  }
  activity: {
    newSkills24h: number
    repoChanges24h: number
    installEvents24h: number
    newUsers24h: number
    digestsSent24h: number
    digestsFailed24h: number
  }
  pipeline: {
    syncJobs: Array<{
      name: string
      status: string | null
      lastRunAt: number | null
      stale: boolean
      error: string | null
    }>
    scheduledRuns: Array<{
      taskName: string
      health: ScheduleHealth
    }>
    newlyBrokenReposTotal24h: number
    newlyBrokenReposImpacted24h: number
    skillSyncFailures24h: number
    staleDirtySkills: number
    aiBatchesSubmitted: number
    aiBatchesStuck: number
    aiBatchesFailed24h: number
    failedJobs24h: number
    staleReservedJobs: number
    openFailedBatches: number
    discoveryCandidatesExhausted: number
    discoveryCandidatesOverdue: number
    discoveryClaimsStale: number
    leaderboardApprovalsStuck: number
    failedJobDetails: Array<{
      queue: string
      jobType: string
      exception: string
      count: number
    }>
  }
  cost: {
    estimatedAiUsd24h: number
    estimatedAiUsdMonth: number
  }
  credentials: {
    githubToken: TokenExpiryStatus
  }
}

interface InventoryRow {
  skills: number
  repos: number
  owners: number
  users: number
  collections: number
  watched_repos: number
  broken_repos: number
}

interface ActivityRow {
  new_skills_24h: number
  repo_changes_24h: number
  new_users_24h: number
  digests_sent_24h: number
  digests_failed_24h: number
}

interface InstallActivityRow {
  install_events_24h: number
}

interface PipelineRow {
  newly_broken_repos_total_24h: number
  newly_broken_repos_impacted_24h: number
  skill_sync_failures_24h: number
  stale_dirty_skills: number
  ai_batches_submitted: number
  ai_batches_stuck: number
  ai_batches_failed_24h: number
  failed_jobs_24h: number
  stale_reserved_jobs: number
  open_failed_batches: number
  discovery_candidates_exhausted: number
  discovery_candidates_overdue: number
  discovery_claims_stale: number
  leaderboard_approvals_stuck: number
}

interface SyncJobRow {
  name: string
  cron: string
  stale_after_seconds: number | null
  last_run_at: number | null
  last_status: string | null
  last_error: string | null
}

interface ScheduledRunRow {
  slot: 'latest' | 'terminal'
  task_name: string
  status: 'started' | 'succeeded' | 'failed' | 'expired'
  started_at: number
  expires_at: number
  finished_at: number | null
  error: string | null
}

interface FailedJobRow {
  queue: string
  job_type: string
  exception: string
  count: number
}

interface CostRow {
  estimated_ai_usd_24h: number
  estimated_ai_usd_month: number
}

/**
 * The latest run per task, and the latest run that reached a verdict.
 *
 * Those are the same row unless a run is in flight, which is exactly when this
 * check runs: it shares a top-of-hour tick with every hourly task. Reading only
 * the latest row reported sync-github-skills healthy through ten consecutive
 * expiries on 2026-07-26.
 */
export const SCHEDULE_HEALTH_LATEST_RUNS_SQL = `
  WITH ranked_scheduled_runs AS (
    SELECT
      task_name,
      status,
      started_at,
      expires_at,
      finished_at,
      error,
      ROW_NUMBER() OVER (
        PARTITION BY task_name
        ORDER BY started_at DESC, run_id DESC
      ) AS recency
    FROM scheduled_runs
    INDEXED BY idx_scheduled_runs_task_latest
  ),
  ranked_terminal_runs AS (
    SELECT
      task_name,
      status,
      started_at,
      expires_at,
      finished_at,
      error,
      ROW_NUMBER() OVER (
        PARTITION BY task_name
        ORDER BY started_at DESC, run_id DESC
      ) AS recency
    FROM scheduled_runs
    INDEXED BY idx_scheduled_runs_task_latest
    WHERE status != 'started'
  )
  SELECT 'latest' AS slot, task_name, status, started_at, expires_at, finished_at, error
  FROM ranked_scheduled_runs
  WHERE recency = 1
  UNION ALL
  SELECT 'terminal' AS slot, task_name, status, started_at, expires_at, finished_at, error
  FROM ranked_terminal_runs
  WHERE recency = 1
`

export type DailyHealthCheckSendResult
  = | { _tag: 'Sent', reportDate: string, status: DailyHealthStatus, to: string, messageId: string }
    | { _tag: 'Duplicate', reportDate: string, to: string }
    | { _tag: 'SendFailed', reportDate: string, status: DailyHealthStatus, to: string, error: string }
    | { _tag: 'Uncertain', reportDate: string, status: DailyHealthStatus, to: string, error: string }

type SummaryBuilder = (db: D1Database, options: { now: Date }) => Promise<DailyHealthCheckSummary>
type EmailSender = (input: SendEmailInput) => Promise<SendEmailResult>

interface SendDailyHealthCheckOptions {
  now?: Date
  to: string
  build?: SummaryBuilder
  send: EmailSender
}

interface BuildDailyHealthCheckOptions {
  now?: Date
  fetcher?: typeof fetch
  workerVersion?: string | null
  githubToken?: string
  /**
   * Deliberately separate from `fetcher`. That one is the SELF service binding,
   * which dispatches every request to this Worker, so reusing it here would
   * send the GitHub probe to our own front door.
   */
  githubFetcher?: typeof fetch
}

/**
 * One cheap authenticated call. GitHub answers with
 * `github-authentication-token-expiration`, so the credential deadline is read
 * from the same place that would reject the token once it passes.
 */
export async function loadGithubTokenExpiry(
  token: string | undefined,
  now: Date,
  fetcher: typeof fetch = fetch,
): Promise<TokenExpiryStatus> {
  if (!token)
    return { _tag: 'unknown' }
  const res = await fetcher('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'skilld.dev',
      'Accept': 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    console.warn(`[health-check] token expiry probe failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  })
  if (!res)
    return { _tag: 'unknown' }
  return tokenExpiryStatus(parseTokenExpiry(res.headers), now)
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function reportDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: MELBOURNE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function iso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function plural(count: number, singular: string, multiple = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : multiple}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[character]!)
}

async function first<T>(db: D1Database, sql: string, bindings: unknown[] = []): Promise<T> {
  const statement = bindings.length ? db.prepare(sql).bind(...bindings) : db.prepare(sql)
  const row = await statement.first<T>()
  if (!row)
    throw new Error('health query returned no row')
  return row
}

async function all<T>(db: D1Database, sql: string, bindings: unknown[] = []): Promise<T[]> {
  const statement = bindings.length ? db.prepare(sql).bind(...bindings) : db.prepare(sql)
  const result = await statement.all<T>()
  return result.results ?? []
}

async function capture<T>(warnings: string[], label: string, fallback: T, load: () => Promise<T>): Promise<T> {
  return await load().catch((error) => {
    warnings.push(`${label}: ${errorMessage(error)}`)
    return fallback
  })
}

function staleAfterSeconds(job: SyncJobRow): number {
  if (job.stale_after_seconds)
    return job.stale_after_seconds
  if (job.cron.startsWith('*/5'))
    return 20 * 60
  if (job.cron.includes('*/6'))
    return 15 * 60 * 60
  if (job.cron === '0 22 * * *' || job.cron === '0 3 * * *')
    return 36 * 60 * 60
  return 3 * 60 * 60
}

export function evaluateDailyHealthStatus(
  summary: Omit<DailyHealthCheckSummary, 'status' | 'reasons'> | DailyHealthCheckSummary,
): { status: DailyHealthStatus, reasons: string[] } {
  const red: string[] = []
  const amber: string[] = []
  const homepage = summary.frontDoor.checks[0]

  if (!homepage || homepage.status === null)
    red.push('Homepage probe failed.')
  else if (homepage.status !== 200)
    red.push(`Homepage returned HTTP ${homepage.status}.`)

  for (const check of summary.frontDoor.checks.slice(1)) {
    if (check.status === null)
      amber.push(`${check.url} probe failed.`)
    else if (check.status !== 200)
      amber.push(`${check.url} returned HTTP ${check.status}.`)
  }

  if (summary.activity.digestsFailed24h > 0)
    red.push(`${plural(summary.activity.digestsFailed24h, 'digest delivery', 'digest deliveries')} failed in 24 hours.`)
  if (summary.pipeline.failedJobs24h > 0)
    red.push(`${plural(summary.pipeline.failedJobs24h, 'job')} failed in 24 hours.`)
  if (summary.pipeline.staleReservedJobs > 0)
    red.push(`${plural(summary.pipeline.staleReservedJobs, 'job')} remained reserved for over 15 minutes.`)

  const erroredSyncJobs = summary.pipeline.syncJobs.filter(job => job.status === 'error')
  if (erroredSyncJobs.length) {
    // The task name alone does not tell the operator what to do. A rejected
    // GitHub credential took the whole sync pipeline down for two days behind
    // the reason "Scheduled tasks failed: sync-github-skills".
    red.push(`Scheduled tasks failed: ${erroredSyncJobs
      .map(job => (job.error ? `${job.name} (${job.error})` : job.name))
      .join(', ')}.`)
  }
  const staleSyncJobs = summary.pipeline.syncJobs.filter(job => job.stale)
  if (staleSyncJobs.length)
    red.push(`Scheduled tasks are stale: ${staleSyncJobs.map(job => job.name).join(', ')}.`)

  const partialSyncJobs = summary.pipeline.syncJobs.filter(job => job.status === 'partial')
  if (partialSyncJobs.length)
    amber.push(`Scheduled tasks partially failed: ${partialSyncJobs.map(job => job.name).join(', ')}.`)
  const unhealthyScheduledRuns = summary.pipeline.scheduledRuns.filter(run => run.health.alertable)
  if (unhealthyScheduledRuns.length) {
    red.push(`Scheduled run history is unhealthy: ${unhealthyScheduledRuns
      .map(run => `${run.taskName} (${run.health._tag})`)
      .join(', ')}.`)
  }
  if (summary.pipeline.newlyBrokenReposImpacted24h > 0)
    amber.push(`${plural(summary.pipeline.newlyBrokenReposImpacted24h, 'user-impacting repository')} became unavailable in 24 hours.`)
  if (summary.pipeline.skillSyncFailures24h > 0)
    amber.push(`${plural(summary.pipeline.skillSyncFailures24h, 'skill')} recorded a new sync failure in 24 hours.`)
  if (summary.pipeline.staleDirtySkills > 0)
    amber.push(`${plural(summary.pipeline.staleDirtySkills, 'dirty skill')} waited over 1 hour.`)
  if (summary.pipeline.aiBatchesStuck > 0)
    amber.push(`${plural(summary.pipeline.aiBatchesStuck, 'AI batch', 'AI batches')} ${summary.pipeline.aiBatchesStuck === 1 ? 'has' : 'have'} been submitted for over 3 hours.`)
  if (summary.pipeline.aiBatchesFailed24h > 0)
    amber.push(`${plural(summary.pipeline.aiBatchesFailed24h, 'AI batch', 'AI batches')} failed in 24 hours.`)
  if (summary.pipeline.openFailedBatches > 0)
    amber.push(`${plural(summary.pipeline.openFailedBatches, 'job batch', 'job batches')} remains open with failures.`)
  if (summary.pipeline.discoveryCandidatesExhausted > 0)
    amber.push(`${plural(summary.pipeline.discoveryCandidatesExhausted, 'discovery candidate')} exhausted automatic retries.`)
  if (summary.pipeline.discoveryCandidatesOverdue > 0)
    amber.push(`${plural(summary.pipeline.discoveryCandidatesOverdue, 'discovery candidate')} ${summary.pipeline.discoveryCandidatesOverdue === 1 ? 'is' : 'are'} overdue for retry.`)
  if (summary.pipeline.discoveryClaimsStale > 0)
    amber.push(`${plural(summary.pipeline.discoveryClaimsStale, 'discovery claim')} remained active for over 1 hour.`)
  if (summary.pipeline.leaderboardApprovalsStuck > 0) {
    amber.push(`${summary.pipeline.leaderboardApprovalsStuck} reviewed leaderboard ${summary.pipeline.leaderboardApprovalsStuck === 1 ? 'repository' : 'repositories'} remained invisible for over 15 minutes.`)
  }
  if (summary.warnings.length > 0)
    amber.push(`${plural(summary.warnings.length, 'report probe')} failed.`)

  // An expired credential already cost two days of dead sync. GitHub returns
  // the deadline on every authenticated response, so it is worth surfacing
  // while rotating is still routine rather than an incident.
  const token = summary.credentials.githubToken
  if (token._tag === 'expired')
    red.push(`GITHUB_TOKEN expired ${plural(Math.abs(token.daysRemaining), 'day')} ago. Rotate it: sync is down until you do.`)
  else if (token._tag === 'expiring')
    amber.push(`GITHUB_TOKEN expires in ${plural(token.daysRemaining, 'day')}. Rotate it before sync starts failing.`)

  // Report every finding, ordered by severity, rather than only the winning
  // tier. Returning `red` alone meant one loud red hid every amber underneath
  // it: on 2026-07-25 the sole reason was a front-door probe artefact while the
  // GitHub sync had been failing for two days one severity level below.
  if (red.length || amber.length)
    return { status: red.length ? 'RED' : 'AMBER', reasons: [...red, ...amber] }
  return { status: 'GREEN', reasons: ['All monitored systems are healthy.'] }
}

const FRONT_DOOR_URLS = [
  'https://skilld.dev/',
  'https://skilld.dev/skills',
  'https://skilld.dev/guides',
] as const

const FRONT_DOOR_MAX_ATTEMPTS = 3
const FRONT_DOOR_RETRY_DELAY_MS = 1_500
const realSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// A plain fetch to https://skilld.dev/ from inside this Worker leaves the
// runtime, fails to route back, and returns 522 every time, which pinned the
// operator email RED for days while real traffic served fine. The SELF service
// binding dispatches straight to this Worker's fetch handler, so the probe
// answers "does the app still render" instead of measuring the loopback. It
// deliberately skips DNS, TLS, and the edge; those belong to an external prober.
// A missing binding rejects rather than falling back to the public URL, because
// a silent fallback would reintroduce the 522 that made this report untrustworthy.
export function frontDoorFetcher(env: { SELF?: Fetcher }): typeof fetch {
  const self = env.SELF
  if (!self) {
    console.warn('[daily-health-check] SELF service binding missing; front door cannot be probed')
    return () => Promise.reject(new Error('SELF service binding not configured'))
  }
  return ((input, init) => self.fetch(input as RequestInfo, init as RequestInit)) as typeof fetch
}

export interface FrontDoorProbeOptions {
  attempts?: number
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

// Front door probes retry before settling: a single transient 522/timeout must
// not flip the whole operator report RED. A 200 on any attempt passes; a status
// that never reaches 200 is reported as-is so a sustained outage still escalates.
// In production the caller passes the SELF service binding as the fetcher, since
// a public-URL fetch from inside this Worker never routes back and always 522s.
export async function loadFrontDoor(
  fetcher: typeof fetch,
  options: FrontDoorProbeOptions = {},
): Promise<DailyHealthCheckSummary['frontDoor']> {
  const attempts = options.attempts ?? FRONT_DOOR_MAX_ATTEMPTS
  const retryDelayMs = options.retryDelayMs ?? FRONT_DOOR_RETRY_DELAY_MS
  const sleep = options.sleep ?? realSleep
  const checks = await Promise.all(FRONT_DOOR_URLS.map(async (url) => {
    let status: number | null = null
    for (let attempt = 1; attempt <= attempts; attempt++) {
      // A transport failure is a front-door result, not an exception: null is
      // carried into the report so the operator sees "no response" instead of
      // the probe collapsing the whole summary.
      status = await fetcher(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      }).then(response => response.status).catch((error) => {
        console.warn(`[health-check] ${url} attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`)
        return null
      })
      if (status === 200)
        break
      if (attempt < attempts)
        await sleep(retryDelayMs)
    }
    return { url, status }
  }))
  return { checks }
}

async function loadInventory(db: D1Database): Promise<DailyHealthCheckSummary['inventory']> {
  const row = await first<InventoryRow>(db, `
    SELECT
      (SELECT COUNT(*) FROM skills) AS skills,
      (SELECT COUNT(*) FROM repos) AS repos,
      (SELECT COUNT(*) FROM owners) AS owners,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM collections_v2 WHERE deleted_at IS NULL) AS collections,
      (SELECT COUNT(*) FROM user_starred_repos) AS watched_repos,
      (SELECT COUNT(*) FROM repos WHERE broken_since IS NOT NULL) AS broken_repos
  `)
  return {
    skills: numberValue(row.skills),
    repos: numberValue(row.repos),
    owners: numberValue(row.owners),
    users: numberValue(row.users),
    collections: numberValue(row.collections),
    watchedRepos: numberValue(row.watched_repos),
    brokenRepos: numberValue(row.broken_repos),
  }
}

async function loadActivity(
  db: D1Database,
  sinceSec: number,
  sinceMs: number,
  warnings: string[],
): Promise<DailyHealthCheckSummary['activity']> {
  const row = await first<ActivityRow>(db, `
    SELECT
      (SELECT COUNT(*) FROM skills WHERE first_seen_at >= ?1) AS new_skills_24h,
      (SELECT COUNT(DISTINCT owner || '/' || repo) FROM activity WHERE occurred_at >= ?1) AS repo_changes_24h,
      (SELECT COUNT(*) FROM users WHERE created_at >= ?1) AS new_users_24h,
      (SELECT COUNT(*) FROM digest_runs WHERE status = 'sent' AND sent_at >= ?1) AS digests_sent_24h,
      ((SELECT COUNT(*) FROM digest_runs
        WHERE status = 'failed' AND finished_at >= ?1)
       + (SELECT COUNT(*) FROM digest_runs
          WHERE status IN ('sending', 'uncertain'))) AS digests_failed_24h
  `, [sinceSec])
  const installs = await capture(warnings, 'install activity', { install_events_24h: 0 }, () => first<InstallActivityRow>(db, `
    SELECT COUNT(*) AS install_events_24h
    FROM install_events
    WHERE occurred_at >= ?1
  `, [sinceMs]))
  return {
    newSkills24h: numberValue(row.new_skills_24h),
    repoChanges24h: numberValue(row.repo_changes_24h),
    installEvents24h: numberValue(installs.install_events_24h),
    newUsers24h: numberValue(row.new_users_24h),
    digestsSent24h: numberValue(row.digests_sent_24h),
    digestsFailed24h: numberValue(row.digests_failed_24h),
  }
}

async function loadPipeline(db: D1Database, nowSec: number, sinceSec: number): Promise<DailyHealthCheckSummary['pipeline']> {
  const terminalDiscoveryRejections = TERMINAL_DISCOVERY_REJECTION_REASONS
    .map(reason => `'${reason}'`)
    .join(', ')
  const [row, jobRows, scheduledRunRows, failedJobRows] = await Promise.all([
    first<PipelineRow>(db, `
      SELECT
        (SELECT COUNT(*) FROM repos WHERE broken_since >= ?1) AS newly_broken_repos_total_24h,
        (SELECT COUNT(*)
         FROM repos r
         WHERE r.broken_since >= ?1
           AND (
             EXISTS (
               SELECT 1 FROM skills s
               WHERE s.owner = r.owner AND s.repo = r.repo
             )
             OR EXISTS (
               SELECT 1 FROM user_starred_repos usr
               WHERE usr.owner = r.owner AND usr.repo = r.repo
             )
             OR EXISTS (
               SELECT 1 FROM skill_subscriptions sub
               WHERE sub.owner = r.owner AND sub.repo = r.repo
             )
             OR EXISTS (
               SELECT 1 FROM collection_skills_v2 cs
               WHERE cs.owner = r.owner AND cs.repo = r.repo
             )
             OR EXISTS (
               SELECT 1
               FROM activity a
               JOIN install_events ie ON ie.slug = a.owner || '/' || a.name
               WHERE a.owner = r.owner AND a.repo = r.repo
             )
           )) AS newly_broken_repos_impacted_24h,
        (SELECT COUNT(*) FROM skills WHERE sync_status IS NOT NULL AND sync_status != 'ok' AND last_synced_at >= ?1) AS skill_sync_failures_24h,
        (SELECT COUNT(*) FROM skill_dirty WHERE queued_at < ?2) AS stale_dirty_skills,
        (SELECT COUNT(*) FROM ai_batches WHERE status = 'submitted') AS ai_batches_submitted,
        (SELECT COUNT(*) FROM ai_batches WHERE status = 'submitted' AND submitted_at < ?3) AS ai_batches_stuck,
        (SELECT COUNT(*) FROM ai_batches WHERE status IN ('failed', 'expired') AND COALESCE(completed_at, submitted_at) >= ?1) AS ai_batches_failed_24h,
        (SELECT COUNT(*) FROM failed_jobs WHERE failed_at >= ?1) AS failed_jobs_24h,
        (SELECT COUNT(*) FROM jobs WHERE reserved_at IS NOT NULL AND reserved_at < ?4 AND completed_at IS NULL AND failed_at IS NULL) AS stale_reserved_jobs,
        (SELECT COUNT(*) FROM job_batches WHERE failed_jobs > 0 AND finished_at IS NULL) AS open_failed_batches,
        (SELECT COUNT(*) FROM discovery_candidates
          WHERE retry_state = 'exhausted'
            AND NOT (
              outcome = 'rejected'
              AND rejection_reason IN (${terminalDiscoveryRejections})
            )) AS discovery_candidates_exhausted,
        (SELECT COUNT(*) FROM discovery_candidates
          WHERE retry_state = 'retry_scheduled' AND next_retry_at < ?5) AS discovery_candidates_overdue,
        (SELECT COUNT(*) FROM discovery_candidates
          WHERE retry_state = 'claimed' AND claimed_at < ?6) AS discovery_claims_stale,
        (SELECT COUNT(*)
         FROM skill_repo_eligibility AS review
         WHERE review.status = 'eligible'
           AND review.reviewed_at < ?7
           AND NOT EXISTS (
             SELECT 1
             FROM repos AS r
             JOIN skills AS s
               ON s.owner = r.owner
              AND s.repo = r.repo
             WHERE r.owner = review.owner
               AND r.repo = review.repo
               AND r.broken_since IS NULL
           )) AS leaderboard_approvals_stuck
    `, [
      sinceSec,
      nowSec - DIRTY_STUCK_SECONDS,
      nowSec - AI_STUCK_SECONDS,
      nowSec - RESERVED_STUCK_SECONDS,
      nowSec - CLAIM_STALE_SECONDS,
      nowSec - CLAIM_STALE_SECONDS,
      nowSec - RESERVED_STUCK_SECONDS,
    ]),
    all<SyncJobRow>(db, `
      SELECT name, cron, stale_after_seconds, last_run_at, last_status, last_error
      FROM sync_jobs
      WHERE enabled = 1
      ORDER BY name
    `),
    all<ScheduledRunRow>(db, SCHEDULE_HEALTH_LATEST_RUNS_SQL),
    all<FailedJobRow>(db, `
      SELECT queue, job_type, substr(exception, 1, 160) AS exception, COUNT(*) AS count
      FROM failed_jobs
      WHERE failed_at >= ?1
      GROUP BY queue, job_type, substr(exception, 1, 160)
      ORDER BY count DESC
      LIMIT 8
    `, [sinceSec]),
  ])

  const scheduledRun = (slot: ScheduledRunRow['slot']): Map<string, ScheduledRunRow> =>
    new Map(scheduledRunRows.filter(run => run.slot === slot).map(run => [run.task_name, run]))
  const latestScheduledRun = scheduledRun('latest')
  const latestTerminalRun = scheduledRun('terminal')
  const asRun = (row: ScheduledRunRow | undefined): LatestScheduledRun | null => row
    ? {
        status: row.status,
        startedAt: row.started_at,
        expiresAt: row.expires_at,
        finishedAt: row.finished_at,
        error: row.error,
      }
    : null
  return {
    syncJobs: jobRows.map(job => ({
      name: job.name,
      status: job.last_status,
      lastRunAt: job.last_run_at,
      stale: job.last_run_at === null || job.last_run_at < nowSec - staleAfterSeconds(job),
      error: job.last_error,
    })),
    scheduledRuns: SCHEDULE_POLICY.map(policy => ({
      taskName: policy.taskName,
      health: evaluateScheduleHealth(policy, {
        latest: asRun(latestScheduledRun.get(policy.taskName)),
        latestTerminal: asRun(latestTerminalRun.get(policy.taskName)),
      }, nowSec),
    })),
    newlyBrokenReposTotal24h: numberValue(row.newly_broken_repos_total_24h),
    newlyBrokenReposImpacted24h: numberValue(row.newly_broken_repos_impacted_24h),
    skillSyncFailures24h: numberValue(row.skill_sync_failures_24h),
    staleDirtySkills: numberValue(row.stale_dirty_skills),
    aiBatchesSubmitted: numberValue(row.ai_batches_submitted),
    aiBatchesStuck: numberValue(row.ai_batches_stuck),
    aiBatchesFailed24h: numberValue(row.ai_batches_failed_24h),
    failedJobs24h: numberValue(row.failed_jobs_24h),
    staleReservedJobs: numberValue(row.stale_reserved_jobs),
    openFailedBatches: numberValue(row.open_failed_batches),
    discoveryCandidatesExhausted: numberValue(row.discovery_candidates_exhausted),
    discoveryCandidatesOverdue: numberValue(row.discovery_candidates_overdue),
    discoveryClaimsStale: numberValue(row.discovery_claims_stale),
    leaderboardApprovalsStuck: numberValue(row.leaderboard_approvals_stuck),
    failedJobDetails: failedJobRows.map(failure => ({
      queue: failure.queue,
      jobType: failure.job_type,
      exception: failure.exception,
      count: numberValue(failure.count),
    })),
  }
}

async function loadCost(db: D1Database, sinceSec: number, monthStartSec: number): Promise<DailyHealthCheckSummary['cost']> {
  const row = await first<CostRow>(db, `
    SELECT
      COALESCE(SUM(CASE WHEN submitted_at >= ?1 THEN est_cost_usd ELSE 0 END), 0) AS estimated_ai_usd_24h,
      COALESCE(SUM(CASE WHEN submitted_at >= ?2 THEN est_cost_usd ELSE 0 END), 0) AS estimated_ai_usd_month
    FROM ai_batch_costs
  `, [sinceSec, monthStartSec])
  return {
    estimatedAiUsd24h: numberValue(row.estimated_ai_usd_24h),
    estimatedAiUsdMonth: numberValue(row.estimated_ai_usd_month),
  }
}

export async function buildDailyHealthCheck(
  db: D1Database,
  options: BuildDailyHealthCheckOptions = {},
): Promise<DailyHealthCheckSummary> {
  const now = options.now ?? new Date()
  const since = new Date(now.getTime() - DAY_MS)
  const sinceSec = Math.floor(since.getTime() / 1000)
  const sinceMs = since.getTime()
  const monthStartSec = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000)
  const warnings: string[] = []

  const frontDoor = await capture(warnings, 'front door', { checks: [] }, () => loadFrontDoor(options.fetcher ?? fetch))
  const inventory = await capture(warnings, 'inventory', {
    skills: 0,
    repos: 0,
    owners: 0,
    users: 0,
    collections: 0,
    watchedRepos: 0,
    brokenRepos: 0,
  }, () => loadInventory(db))
  const activity = await capture(warnings, 'activity', {
    newSkills24h: 0,
    repoChanges24h: 0,
    installEvents24h: 0,
    newUsers24h: 0,
    digestsSent24h: 0,
    digestsFailed24h: 0,
  }, () => loadActivity(db, sinceSec, sinceMs, warnings))
  const pipeline = await capture(warnings, 'pipeline', {
    syncJobs: [],
    scheduledRuns: SCHEDULE_POLICY.map(policy => ({
      taskName: policy.taskName,
      health: evaluateScheduleHealth(policy, { latest: null, latestTerminal: null }, Math.floor(now.getTime() / 1000)),
    })),
    newlyBrokenReposTotal24h: 0,
    newlyBrokenReposImpacted24h: 0,
    skillSyncFailures24h: 0,
    staleDirtySkills: 0,
    aiBatchesSubmitted: 0,
    aiBatchesStuck: 0,
    aiBatchesFailed24h: 0,
    failedJobs24h: 0,
    staleReservedJobs: 0,
    openFailedBatches: 0,
    discoveryCandidatesExhausted: 0,
    discoveryCandidatesOverdue: 0,
    discoveryClaimsStale: 0,
    leaderboardApprovalsStuck: 0,
    failedJobDetails: [],
  }, () => loadPipeline(db, Math.floor(now.getTime() / 1000), sinceSec))
  const cost = await capture(warnings, 'AI cost', {
    estimatedAiUsd24h: 0,
    estimatedAiUsdMonth: 0,
  }, () => loadCost(db, sinceSec, monthStartSec))

  const credentials = {
    githubToken: await capture<TokenExpiryStatus>(
      warnings,
      'github token expiry',
      { _tag: 'unknown' },
      () => loadGithubTokenExpiry(options.githubToken, now, options.githubFetcher ?? fetch),
    ),
  }

  const withoutStatus = {
    warnings,
    window: {
      reportDate: reportDate(now),
      timeZone: MELBOURNE_TIME_ZONE,
      from: iso(since),
      to: iso(now),
      workerVersion: options.workerVersion ?? null,
    },
    frontDoor,
    inventory,
    activity,
    pipeline,
    cost,
    credentials,
  }
  const evaluated = evaluateDailyHealthStatus(withoutStatus)
  return { ...withoutStatus, ...evaluated }
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

function plainList(items: string[]): string {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- none'
}

export function renderDailyHealthCheckText(summary: DailyHealthCheckSummary): string {
  const failedJobs = summary.pipeline.failedJobDetails.map(item => `${item.queue}/${item.jobType}: ${item.count}, ${item.exception}`)
  const unhealthyTasks = summary.pipeline.syncJobs
    .filter(job => job.stale || (job.status !== null && job.status !== 'ok'))
    .map(job => `${job.name}: ${job.stale ? 'stale' : job.status}${job.error ? `, ${job.error}` : ''}`)
  const unhealthyRuns = summary.pipeline.scheduledRuns
    .filter(run => run.health.alertable)
    .map(run => `${run.taskName}: ${run.health._tag}`)

  return [
    `skilld daily health check: ${summary.status}`,
    `${summary.window.reportDate} (${summary.window.timeZone})`,
    `${summary.window.from} to ${summary.window.to}`,
    summary.window.workerVersion ? `Worker: ${summary.window.workerVersion}` : null,
    '',
    'Reasons:',
    plainList(summary.reasons),
    '',
    'Front door:',
    plainList(summary.frontDoor.checks.map(check => `${check.url}: ${check.status === null ? 'probe failed' : `HTTP ${check.status}`}`)),
    '',
    'Inventory:',
    `- ${summary.inventory.skills} skills, ${summary.inventory.repos} repos, ${summary.inventory.owners} owners`,
    `- ${summary.inventory.users} users, ${summary.inventory.collections} collections, ${summary.inventory.watchedRepos} watched repos`,
    `- ${summary.inventory.brokenRepos} broken repos, shown as known inventory and not a health gate`,
    '',
    'Last 24 hours:',
    `- ${summary.activity.newSkills24h} new skills, ${summary.activity.repoChanges24h} changed repos, ${summary.activity.installEvents24h} install events`,
    `- ${summary.activity.newUsers24h} new users, ${summary.activity.digestsSent24h} digests sent, ${summary.activity.digestsFailed24h} failed`,
    '',
    'Pipeline:',
    `- newly broken repos: ${summary.pipeline.newlyBrokenReposTotal24h} total, ${summary.pipeline.newlyBrokenReposImpacted24h} user-impacting; ${summary.pipeline.skillSyncFailures24h} new skill sync failures`,
    `- ${summary.pipeline.staleDirtySkills} dirty skills waiting over 1 hour`,
    `- AI batches: ${summary.pipeline.aiBatchesSubmitted} submitted, ${summary.pipeline.aiBatchesStuck} stuck, ${summary.pipeline.aiBatchesFailed24h} failed in 24 hours`,
    `- jobs: ${summary.pipeline.failedJobs24h} failed in 24 hours, ${summary.pipeline.staleReservedJobs} stale reserved, ${summary.pipeline.openFailedBatches} open failed batches`,
    `- discovery: ${summary.pipeline.discoveryCandidatesExhausted} exhausted, ${summary.pipeline.discoveryCandidatesOverdue} overdue retries, ${summary.pipeline.discoveryClaimsStale} stale claims`,
    `- leaderboard: ${summary.pipeline.leaderboardApprovalsStuck} reviewed approvals invisible over 15 minutes`,
    '',
    'Scheduled task issues:',
    plainList([...unhealthyTasks, ...unhealthyRuns]),
    '',
    'Failed job fingerprints:',
    plainList(failedJobs),
    '',
    'Known AI batch cost:',
    `- ${formatUsd(summary.cost.estimatedAiUsd24h)} in 24 hours, ${formatUsd(summary.cost.estimatedAiUsdMonth)} this UTC month`,
    '',
    'Report warnings:',
    plainList(summary.warnings),
  ].filter(line => line !== null).join('\n')
}

function metric(label: string, value: string | number): string {
  return `<tr><td style="padding:6px 12px 6px 0;color:#667085;font-size:13px">${escapeHtml(label)}</td><td style="padding:6px 0;color:#101828;font-size:13px;font-weight:600;text-align:right">${escapeHtml(String(value))}</td></tr>`
}

function card(title: string, rows: string): string {
  return `<td style="width:50%;vertical-align:top;padding:8px"><table role="presentation" style="width:100%;border:1px solid #e4e7ec;border-radius:10px;background:#fff"><tr><td colspan="2" style="padding:14px 16px 6px;font-size:14px;font-weight:700">${escapeHtml(title)}</td></tr><tr><td colspan="2" style="padding:0 16px 12px"><table role="presentation" style="width:100%;border-collapse:collapse">${rows}</table></td></tr></table></td>`
}

function htmlList(items: string[]): string {
  return (items.length ? items : ['none']).map(item => `<li>${escapeHtml(item)}</li>`).join('')
}

export function renderDailyHealthCheckHtml(summary: DailyHealthCheckSummary): string {
  const statusColor = summary.status === 'RED' ? '#b42318' : summary.status === 'AMBER' ? '#b54708' : '#067647'
  const unhealthyTasks = summary.pipeline.syncJobs
    .filter(job => job.stale || (job.status !== null && job.status !== 'ok'))
    .map(job => `${job.name}: ${job.stale ? 'stale' : job.status}${job.error ? `, ${job.error}` : ''}`)
  const unhealthyRuns = summary.pipeline.scheduledRuns
    .filter(run => run.health.alertable)
    .map(run => `${run.taskName}: ${run.health._tag}`)
  const failedJobs = summary.pipeline.failedJobDetails.map(item => `${item.queue}/${item.jobType}: ${item.count}, ${item.exception}`)

  return `<!doctype html>
<html>
<body style="font-family:system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f2f4f7;margin:0;padding:28px 14px;color:#101828">
  <table role="presentation" style="max-width:760px;margin:0 auto;border-collapse:collapse">
    <tr><td colspan="2" style="padding:0 8px 14px">
      <div style="font-size:13px;color:#667085;margin-bottom:6px">skilld</div>
      <h1 style="margin:0;font-size:22px;line-height:1.25">Daily health check <span style="color:${statusColor}">${summary.status}</span></h1>
      <div style="font-size:13px;color:#667085;margin-top:8px">${escapeHtml(summary.window.reportDate)} (${escapeHtml(summary.window.timeZone)})</div>
      <div style="font-size:12px;color:#667085;margin-top:3px">${escapeHtml(summary.window.from)} to ${escapeHtml(summary.window.to)}</div>
      ${summary.window.workerVersion ? `<div style="font-size:12px;color:#667085;margin-top:3px">Worker ${escapeHtml(summary.window.workerVersion)}</div>` : ''}
    </td></tr>
    <tr><td colspan="2" style="padding:8px"><table role="presentation" style="width:100%;background:#fff;border:1px solid #e4e7ec;border-radius:10px"><tr><td style="padding:14px 18px"><div style="font-size:14px;font-weight:700;margin-bottom:6px">Reasons</div><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.55">${htmlList(summary.reasons)}</ul></td></tr></table></td></tr>
    <tr>
      ${card('Front door', summary.frontDoor.checks.map(check => metric(new URL(check.url).pathname, check.status === null ? 'PROBE FAILED' : `HTTP ${check.status}`)).join(''))}
      ${card('Last 24 hours', [
        metric('new skills', summary.activity.newSkills24h),
        metric('changed repos', summary.activity.repoChanges24h),
        metric('install events', summary.activity.installEvents24h),
        metric('new users', summary.activity.newUsers24h),
        metric('digests sent / failed', `${summary.activity.digestsSent24h} / ${summary.activity.digestsFailed24h}`),
      ].join(''))}
    </tr>
    <tr>
      ${card('Inventory', [
        metric('skills / repos', `${summary.inventory.skills} / ${summary.inventory.repos}`),
        metric('owners / users', `${summary.inventory.owners} / ${summary.inventory.users}`),
        metric('collections / watched', `${summary.inventory.collections} / ${summary.inventory.watchedRepos}`),
        metric('known broken repos', summary.inventory.brokenRepos),
      ].join(''))}
      ${card('Pipeline', [
        metric('new broken total / impacting', `${summary.pipeline.newlyBrokenReposTotal24h} / ${summary.pipeline.newlyBrokenReposImpacted24h}`),
        metric('dirty skills over 1h', summary.pipeline.staleDirtySkills),
        metric('AI submitted / stuck / failed', `${summary.pipeline.aiBatchesSubmitted} / ${summary.pipeline.aiBatchesStuck} / ${summary.pipeline.aiBatchesFailed24h}`),
        metric('jobs failed / stale reserved', `${summary.pipeline.failedJobs24h} / ${summary.pipeline.staleReservedJobs}`),
        metric('open failed batches', summary.pipeline.openFailedBatches),
        metric('discovery exhausted / overdue / stale', `${summary.pipeline.discoveryCandidatesExhausted} / ${summary.pipeline.discoveryCandidatesOverdue} / ${summary.pipeline.discoveryClaimsStale}`),
        metric('leaderboard approvals stuck', summary.pipeline.leaderboardApprovalsStuck),
      ].join(''))}
    </tr>
    <tr>
      ${card('Known AI cost', [
        metric('last 24 hours', formatUsd(summary.cost.estimatedAiUsd24h)),
        metric('UTC month', formatUsd(summary.cost.estimatedAiUsdMonth)),
      ].join(''))}
    </tr>
    <tr><td colspan="2" style="padding:8px"><table role="presentation" style="width:100%;background:#fff;border:1px solid #e4e7ec;border-radius:10px"><tr><td style="padding:14px 18px">
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">Scheduled task issues</div><ul style="margin:0 0 14px;padding-left:18px;font-size:13px;line-height:1.55">${htmlList([...unhealthyTasks, ...unhealthyRuns])}</ul>
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">Failed job fingerprints</div><ul style="margin:0 0 14px;padding-left:18px;font-size:13px;line-height:1.55">${htmlList(failedJobs)}</ul>
      ${summary.warnings.length ? `<div style="font-size:14px;font-weight:700;margin-bottom:6px">Report warnings</div><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.55">${htmlList(summary.warnings)}</ul>` : ''}
    </td></tr></table></td></tr>
  </table>
</body>
</html>`
}

export async function sendDailyHealthCheck(
  db: D1Database,
  options: SendDailyHealthCheckOptions,
): Promise<DailyHealthCheckSendResult> {
  const now = options.now ?? new Date()
  const build = options.build ?? ((database, buildOptions) => buildDailyHealthCheck(database, buildOptions))
  const summary = await build(db, { now })
  const claimedAt = Math.floor(now.getTime() / 1000)
  const staleClaimBefore = claimedAt - CLAIM_STALE_SECONDS
  const summaryJson = JSON.stringify(summary)

  const claim = await db.prepare(`
    INSERT INTO daily_health_checks (
      report_date, health_status, delivery_status, recipient, claimed_at, summary_json
    ) VALUES (?1, ?2, 'sending', ?3, ?4, ?5)
    ON CONFLICT(report_date) DO UPDATE SET
      health_status = excluded.health_status,
      delivery_status = 'sending',
      recipient = excluded.recipient,
      claimed_at = excluded.claimed_at,
      sent_at = NULL,
      message_id = NULL,
      error = NULL,
      summary_json = excluded.summary_json
    WHERE daily_health_checks.delivery_status = 'failed'
       OR (daily_health_checks.delivery_status = 'sending' AND daily_health_checks.claimed_at < ?6)
  `).bind(
    summary.window.reportDate,
    summary.status,
    options.to,
    claimedAt,
    summaryJson,
    staleClaimBefore,
  ).run()

  if (numberValue(claim.meta.changes) === 0)
    return { _tag: 'Duplicate', reportDate: summary.window.reportDate, to: options.to }

  const delivery = await options.send({
    to: options.to,
    subject: `skilld health: ${summary.status} (${summary.window.reportDate})`,
    html: renderDailyHealthCheckHtml(summary),
    text: renderDailyHealthCheckText(summary),
  }).then(
    result => result,
    (error): SendEmailResult => ({
      _tag: 'uncertain',
      error: errorMessage(error),
    }),
  )

  if (delivery._tag === 'accepted') {
    await db.prepare(`
      UPDATE daily_health_checks
      SET delivery_status = 'sent', sent_at = ?2, message_id = ?3, error = NULL
      WHERE report_date = ?1
    `).bind(summary.window.reportDate, claimedAt, delivery.messageId).run()
    return {
      _tag: 'Sent',
      reportDate: summary.window.reportDate,
      status: summary.status,
      to: options.to,
      messageId: delivery.messageId,
    }
  }

  if (delivery._tag === 'uncertain') {
    return {
      _tag: 'Uncertain',
      reportDate: summary.window.reportDate,
      status: summary.status,
      to: options.to,
      error: delivery.error,
    }
  }

  const error = delivery.error
  await db.prepare(`
    UPDATE daily_health_checks
    SET delivery_status = 'failed', error = ?2
    WHERE report_date = ?1
  `).bind(summary.window.reportDate, error).run()
  return { _tag: 'SendFailed', reportDate: summary.window.reportDate, status: summary.status, to: options.to, error }
}
