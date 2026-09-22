/// <reference types="@cloudflare/workers-types" />

import type { TokenExpiryStatus } from '#layers/registry/server/utils/github-token-expiry'
import type { LatestScheduledRun, ScheduleHealth } from '#shared/schedule-policy'
import { TERMINAL_DISCOVERY_REJECTION_REASONS } from '#layers/registry/server/utils/discovery-candidates'
import { parseTokenExpiry, tokenExpiryStatus } from '#layers/registry/server/utils/github-token-expiry'
import { evaluateScheduleHealth, SCHEDULE_POLICY } from '#shared/schedule-policy'
import { DAILY_DISCOVERY_READ_BUDGET } from '#shared/server/x-ingest'

/**
 * A failed job whose exception is a decision rather than a fault.
 *
 * `handleRegistryRepoJob` records a rejected submission through `ctx.fail()`
 * because the submission UI reads its reason back out of `failed_jobs`. That
 * makes `failed_jobs` a mixed table, so any count over it has to say which of
 * the two it means. `skill_parse_rejected:` carries the offending path, so it
 * is matched by prefix rather than by value.
 *
 * `?8` is the reason list, bound as JSON so the values stay parameters.
 */
const DECISION_EXCEPTION_SQL = `(
  exception IN (SELECT value FROM json_each(?8))
  OR exception LIKE 'skill_parse_rejected:%'
)`
const DECISION_EXCEPTION_JSON = JSON.stringify([...TERMINAL_DISCOVERY_REJECTION_REASONS])

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
  trendingSkills: {
    checks: Array<{ path: string, status: number | null }>
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
    newUsers24h: number
    digestsSent24h: number
    digestsFailed24h: number
    /**
     * Aggregate email link clicks, per campaign.
     *
     * Counters are kept per UTC day, so this sums whole days from `fromDay`
     * onwards rather than an exact 24 hours. Digest clicks are the Loop 2
     * evidence bar.
     */
    emailClicks: {
      fromDay: string
      weekly: number
      digest: number
    }
    /**
     * The most recent weekly run, not a 24 hour count.
     *
     * The weekly fires on Mondays, so a rolling-day metric would read zero on
     * six days out of seven and say nothing about whether the last one landed.
     * Null until the first run exists.
     */
    weekly: {
      windowEnd: number
      sent: number
      skipped: number
      failed: number
      uncertain: number
    } | null
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
    /** Terminal decisions, e.g. a submission with no supported SKILL.md. */
    rejectedJobs24h: number
    staleReservedJobs: number
    openFailedBatches: number
    discoveryCandidatesExhausted: number
    discoveryCandidatesOverdue: number
    discoveryClaimsStale: number
    leaderboardApprovalsStuck: number
    /** The invisible repositories behind the count, so the report names them. */
    leaderboardApprovalDetails: Array<{
      owner: string
      repo: string
      reviewedAt: number
    }>
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
  /**
   * Whether the X spend is buying anything. Every post the search returns
   * costs money whether or not it turns into a skill, so the useful question
   * is not "did it run" but "what did the reads produce, and are we keeping
   * up with the stream".
   */
  xDiscovery: {
    /** Charged reads today against the daily ceiling. */
    budgetSpentToday: number
    budgetLimit: number
    /** Reads charged this UTC month, and what they cost. */
    readsMonth: number
    estimatedUsdMonth: number
    /**
     * False when the last run stopped before reaching the end of its window,
     * which means the ingest is falling behind the stream and the backlog
     * grows every day.
     */
    keepingUp: boolean
    /** Hours between now and the newest post ingested. Rises when behind. */
    cursorLagHours: number | null
    postsStored24h: number
    reposDiscovered24h: number
    /** Verified skill mentions, the actual product of the spend. */
    verifiedSkillsTotal: number
    verifiedSkills24h: number
    /** Reads per verified skill this month. The value-for-money number. */
    readsPerVerifiedSkill: number | null
    ledgerPending: number
    ledgerHeld: number
    /** Submitted long ago with no finished job; indexing is wedged. */
    ledgerStalled: number
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

interface WeeklyRunRow {
  window_end: number
  sent: number
  skipped: number
  failed: number
  uncertain: number
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
  rejected_jobs_24h: number
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

interface LeaderboardApprovalRow {
  owner: string
  repo: string
  reviewed_at: number
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
  }).catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'health-token-expiry-probe', outcome: 'failed' }))
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

/**
 * How often a 5-field cron expression fires, in seconds.
 *
 * Returns null when the expression uses a shape this does not model, so the
 * caller falls back rather than inventing a period.
 */
export function cronPeriodSeconds(cron: string): number | null {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5)
    return null
  // The length check above proves all five exist; the defaults are only there
  // to satisfy `noUncheckedIndexedAccess`, and an empty field would fall
  // through to the same null this returns for any shape it does not model.
  const [minute = '', hour = '', dayOfMonth = '', month = '', dayOfWeek = ''] = fields
  if (dayOfMonth !== '*' || month !== '*')
    return null

  const step = (field: string): number | null => {
    const match = field.match(/^\*\/(\d+)$/)
    if (!match)
      return null
    const value = Number(match[1])
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }
  const isFixed = (field: string): boolean => /^\d+$/.test(field)

  if (dayOfWeek !== '*') {
    // Cloudflare accepts both `1` and `MON`, and the tasks use the named form.
    // Only the numeric form was modelled, so `send-weekly` on `0 9 * * MON`
    // fell to the 3-hour fallback and was reported stale every day.
    const isSingleDay = /^[0-7]$/.test(dayOfWeek)
      || /^(?:SUN|MON|TUE|WED|THU|FRI|SAT)$/i.test(dayOfWeek)
    return isFixed(minute) && isFixed(hour) && isSingleDay
      ? 7 * DAY_SECONDS
      : null
  }

  if (hour === '*') {
    if (minute === '*')
      return 60
    const minuteStep = step(minute)
    if (minuteStep !== null)
      return minuteStep * 60
    return isFixed(minute) ? 60 * 60 : null
  }
  if (!isFixed(minute))
    return null
  const hourStep = step(hour)
  if (hourStep !== null)
    return hourStep * 60 * 60
  return isFixed(hour) ? 24 * 60 * 60 : null
}

/**
 * A task is stale one full period late, plus half a period of slack, never less
 * than 20 minutes.
 *
 * This used to be a hand-kept list of cron prefixes with a 3-hour default, which
 * silently mislabelled every shape nobody had added. `detect-star-surges` runs
 * on `30 4 * * *` and matched no branch, so a daily task was called stale after
 * 3 hours and the nightly report was RED on it every single day. Deriving the
 * window from the period cannot drift as tasks are added. The two shapes the
 * list did cover, five-minute and daily, land on the same 20 minutes and 36
 * hours as before.
 */
function staleAfterSeconds(job: SyncJobRow): number {
  if (job.stale_after_seconds)
    return job.stale_after_seconds
  const period = cronPeriodSeconds(job.cron)
  if (period === null)
    return 3 * 60 * 60
  return Math.max(20 * 60, period + Math.max(15 * 60, period / 2))
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

  const brokenTrendingSkills = summary.trendingSkills.checks.filter(check => check.status !== 200)
  if (brokenTrendingSkills.length > 0)
    red.push(`${plural(brokenTrendingSkills.length, 'trending Skill link')} failed to load.`)

  const weekly = summary.activity.weekly
  if (weekly && weekly.failed + weekly.uncertain > 0)
    red.push(`${plural(weekly.failed + weekly.uncertain, 'weekly email', 'weekly emails')} did not land in the last run.`)
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

  // X discovery. These are spend alerts: the API bills per post returned, so
  // the failure modes are "paying for nothing" and "not paying enough to keep
  // up", and neither shows up as a failed task.
  const x = summary.xDiscovery
  if (!x.keepingUp) {
    amber.push(
      `X discovery spent its full ${x.budgetLimit}-read budget and did not finish the window, `
      + 'so the backlog grew today. Raise DAILY_DISCOVERY_READ_BUDGET or the feed falls further behind.',
    )
  }
  if (x.cursorLagHours !== null && x.cursorLagHours > 24) {
    amber.push(
      `The newest X post ingested is ${Math.round(x.cursorLagHours)} hours old, `
      + 'so trending is showing stale conversation.',
    )
  }
  if (x.ledgerStalled > 0) {
    amber.push(
      `${plural(x.ledgerStalled, 'discovered repository', 'discovered repositories')} `
      + `${x.ledgerStalled === 1 ? 'has' : 'have'} been submitted for over 6 hours without indexing finishing.`,
    )
  }
  // Reads are only worth buying if they turn into skills. A month of spend
  // with nothing verified means the query, not the budget, is the problem.
  if (x.readsMonth >= 500 && x.verifiedSkillsTotal === 0)
    amber.push(`X discovery has spent ${x.readsMonth} reads this month and verified no skills.`)

  // `reportJobRun` keeps `last_status` until the job's next run, so a monthly
  // task paused after a partial verdict re-alarmed every night until the next
  // scheduled run a month later (send-digests 2026-09-01 drove nightly AMBER
  // into October). A partial is news only while its run falls inside this
  // report's 24 hour window; an older verdict is either superseded by a newer
  // run or covered by the staleness alarm above. An unparseable window keeps
  // the unbounded filter so the alarm fails loud rather than silent.
  const windowFromSec = Math.floor(Date.parse(summary.window.from) / 1000)
  const partialSyncJobs = summary.pipeline.syncJobs.filter(job =>
    job.status === 'partial'
    && (Number.isNaN(windowFromSec)
      || (job.lastRunAt !== null && job.lastRunAt >= windowFromSec)),
  )
  if (partialSyncJobs.length)
    amber.push(`Scheduled tasks partially failed: ${partialSyncJobs.map(job => job.name).join(', ')}.`)
  const unhealthyScheduledRuns = summary.pipeline.scheduledRuns.filter(run => run.health.alertable)
  if (unhealthyScheduledRuns.length) {
    red.push(`Scheduled run history is unhealthy: ${unhealthyScheduledRuns
      .map(run => `${run.taskName} (${run.health._tag})`)
      .join(', ')}.`)
  }
  if (summary.pipeline.newlyBrokenReposImpacted24h > 0)
    amber.push(`${plural(summary.pipeline.newlyBrokenReposImpacted24h, 'user-impacting repository', 'user-impacting repositories')} became unavailable in 24 hours.`)
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
    // The count alone made two consecutive reports unactionable: the operator
    // could not tell which repository to look at. The names come from the same
    // stuck-row query, so they always match the count.
    const named = summary.pipeline.leaderboardApprovalDetails
      .map(approval => `${approval.owner}/${approval.repo}`)
      .join(', ')
    amber.push(`${summary.pipeline.leaderboardApprovalsStuck} reviewed leaderboard ${summary.pipeline.leaderboardApprovalsStuck === 1 ? 'repository' : 'repositories'} remained invisible for over 15 minutes${named ? `: ${named}.` : '.'}`)
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
    emitOperationalEvent(createWideEvent({ operation: 'health-front-door-probe', outcome: 'binding-missing' }))
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
      }).then(response => response.status).catch(() => {
        emitOperationalEvent(createWideEvent({ operation: 'health-http-probe', outcome: 'failed', attempt }))
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

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Trending response entry is invalid')
  return value as Record<string, unknown>
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value)
    throw new Error(`Trending response ${field} is invalid`)
  return value
}

function arrayValue(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value))
    throw new Error(`Trending response ${field} is invalid`)
  return value
}

function registryPathValue(value: unknown, field: string): string {
  const path = stringValue(value, field)
  const segments = path.split('/').filter(Boolean)
  if (!path.startsWith('/gh/')
    || path.includes('?')
    || path.includes('#')
    || (segments.length !== 3 && segments.length !== 4)
    || segments[0] !== 'gh'
    || segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error(`Trending response ${field} is invalid`)
  }
  return path
}

function parseFeedTargets(value: unknown): string[] {
  const root = objectValue(value)
  return [...arrayValue(root.namedSkills, 'namedSkills'), ...arrayValue(root.fallback, 'fallback')]
    .map((value) => {
      const row = objectValue(value)
      return registryPathValue(row.registryPath, 'registryPath')
    })
}

function parseLeaderboardTargets(value: unknown): string[] {
  const root = objectValue(value)
  return arrayValue(root.items, 'items').map((value) => {
    const row = objectValue(value)
    const topSkill = objectValue(row.topSkill)
    return registryPathValue(topSkill.registryPath, 'topSkill.registryPath')
  })
}

async function responseJson(response: Response, source: string): Promise<unknown> {
  if (!response.ok)
    throw new Error(`${source} returned HTTP ${response.status}`)
  return response.json() as Promise<unknown>
}

export async function loadTrendingSkillPages(
  fetcher: typeof fetch,
): Promise<DailyHealthCheckSummary['trendingSkills']> {
  const [monthResponse, weekResponse, leaderboardResponse] = await Promise.all([
    fetcher('https://skilld.dev/api/feed/trending?limit=30&window=720'),
    fetcher('https://skilld.dev/api/feed/trending?limit=30&window=168'),
    fetcher('https://skilld.dev/api/skills/leaderboard?page=1'),
  ])
  const [month, week, leaderboard] = await Promise.all([
    responseJson(monthResponse, 'Monthly trending feed'),
    responseJson(weekResponse, 'Weekly trending feed'),
    responseJson(leaderboardResponse, 'Trending leaderboard'),
  ])
  const paths = [...new Set([
    ...parseFeedTargets(month),
    ...parseFeedTargets(week),
    ...parseLeaderboardTargets(leaderboard),
  ])]
  const checks: DailyHealthCheckSummary['trendingSkills']['checks'] = []

  for (let offset = 0; offset < paths.length; offset += 10) {
    const batch = paths.slice(offset, offset + 10)
    checks.push(...await Promise.all(batch.map(async path => ({
      path,
      status: await fetcher(`https://skilld.dev${path}`, {
        redirect: 'follow',
        headers: { 'user-agent': 'Googlebot skilld daily health check' },
        signal: AbortSignal.timeout(15_000),
      }).then(response => response.status).catch(() => {
        // A transport failure is a probe result. The RED verdict reports it.
        return null
      }),
    }))))
  }

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

async function loadEmailClicks(db: D1Database, fromDay: string): Promise<DailyHealthCheckSummary['activity']['emailClicks']> {
  const row = await first<{ weekly: number | null, digest: number | null }>(db, `
    SELECT
      SUM(clicks) FILTER (WHERE campaign = 'weekly') AS weekly,
      SUM(clicks) FILTER (WHERE campaign = 'digest') AS digest
    FROM email_click_counts
    WHERE day >= ?1
  `, [fromDay])
  return { fromDay, weekly: numberValue(row.weekly), digest: numberValue(row.digest) }
}

async function loadActivity(
  db: D1Database,
  sinceSec: number,
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
  const fromDay = new Date(sinceSec * 1000).toISOString().slice(0, 10)
  const emailClicks = await capture(warnings, 'email clicks', { fromDay, weekly: 0, digest: 0 }, () => loadEmailClicks(db, fromDay))
  const weekly = await capture(warnings, 'weekly delivery', null, () => loadWeeklyRun(db))
  return {
    newSkills24h: numberValue(row.new_skills_24h),
    repoChanges24h: numberValue(row.repo_changes_24h),
    newUsers24h: numberValue(row.new_users_24h),
    digestsSent24h: numberValue(row.digests_sent_24h),
    digestsFailed24h: numberValue(row.digests_failed_24h),
    emailClicks,
    weekly,
  }
}

/**
 * How the newest weekly window went, counted per status.
 *
 * Grouped by `window_end` rather than by time so a run still reports as one
 * batch when a retry lands hours after the first pass.
 */
async function loadWeeklyRun(db: D1Database): Promise<DailyHealthCheckSummary['activity']['weekly']> {
  const row = await db.prepare(`
    SELECT window_end,
           SUM(status = 'sent') AS sent,
           SUM(status = 'skipped') AS skipped,
           SUM(status = 'failed') AS failed,
           SUM(status IN ('uncertain', 'claimed')) AS uncertain
    FROM weekly_runs
    GROUP BY window_end
    ORDER BY window_end DESC
    LIMIT 1
  `).first<WeeklyRunRow>()
  if (!row)
    return null
  return {
    windowEnd: numberValue(row.window_end),
    sent: numberValue(row.sent),
    skipped: numberValue(row.skipped),
    failed: numberValue(row.failed),
    uncertain: numberValue(row.uncertain),
  }
}

/**
 * One reviewed leaderboard approval that has not become visible yet: the gate
 * still says eligible, the owner is a user (the leaderboard scope), and no
 * healthy skill row exists for the repository.
 *
 * A repository whose repos row is broken (deleted upstream) is excluded: the
 * breakage is a known state reported by the broken-repo metrics, so its
 * review would otherwise re-alarm every night forever.
 *
 * Shared by the count and the named-rows query so the number and the names in
 * the report cannot drift apart. `param` is the placeholder index for the
 * visibility deadline, which each statement binds at its own position.
 */
function leaderboardStuckSql(param: number): string {
  return `review.status = 'eligible'
          AND review.reviewed_at < ?${param}
          AND EXISTS (
            SELECT 1
            FROM owners AS owner
            WHERE owner.owner = review.owner
              AND owner.kind = 'user'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM repos AS r
            JOIN skills AS s
              ON s.owner = r.owner
             AND s.repo = r.repo
            WHERE r.owner = review.owner
              AND r.repo = review.repo
              AND r.broken_since IS NULL
          )
          AND NOT EXISTS (
            SELECT 1
            FROM repos AS broken
            WHERE broken.owner = review.owner
              AND broken.repo = review.repo
              AND broken.broken_since IS NOT NULL
          )`
}

async function loadPipeline(db: D1Database, nowSec: number, sinceSec: number): Promise<DailyHealthCheckSummary['pipeline']> {
  const [row, jobRows, scheduledRunRows, failedJobRows, leaderboardApprovalRows] = await Promise.all([
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
           )) AS newly_broken_repos_impacted_24h,
        (SELECT COUNT(*) FROM skills WHERE sync_status IS NOT NULL AND sync_status != 'ok' AND last_synced_at >= ?1) AS skill_sync_failures_24h,
        (SELECT COUNT(*) FROM skill_dirty WHERE queued_at < ?2) AS stale_dirty_skills,
        (SELECT COUNT(*) FROM ai_batches WHERE status = 'submitted') AS ai_batches_submitted,
        (SELECT COUNT(*) FROM ai_batches WHERE status = 'submitted' AND submitted_at < ?3) AS ai_batches_stuck,
        (SELECT COUNT(*) FROM ai_batches WHERE status IN ('failed', 'expired') AND COALESCE(completed_at, submitted_at) >= ?1) AS ai_batches_failed_24h,
        -- Same principle as the discovery-candidate alarm below: a rejection is
        -- a decision, not a fault. A submitted repository with no supported
        -- SKILL.md is recorded through ctx.fail() so the submission UI can
        -- explain itself, which lands it in failed_jobs. Counting those as
        -- faults made a healthy day of correctly rejecting unsuitable
        -- submissions page the operator: 73 of the 623 failures in the
        -- 2026-08-16 window were decisions.
        (SELECT COUNT(*) FROM failed_jobs
          WHERE failed_at >= ?1
            AND NOT ${DECISION_EXCEPTION_SQL}) AS failed_jobs_24h,
        (SELECT COUNT(*) FROM failed_jobs
          WHERE failed_at >= ?1
            AND ${DECISION_EXCEPTION_SQL}) AS rejected_jobs_24h,
        (SELECT COUNT(*) FROM jobs WHERE reserved_at IS NOT NULL AND reserved_at < ?4 AND completed_at IS NULL AND failed_at IS NULL) AS stale_reserved_jobs,
        (SELECT COUNT(*) FROM job_batches WHERE failed_jobs > 0 AND finished_at IS NULL) AS open_failed_batches,
        -- A rejection is a decision whatever its reason (parse failures carry
        -- the offending path in the reason, so no static list can match them).
        -- The alarm exists for candidates that ran out of retries with no
        -- decision recorded, and only 'retryable_failure' means that.
        (SELECT COUNT(*) FROM discovery_candidates
          WHERE retry_state = 'exhausted'
            AND outcome = 'retryable_failure') AS discovery_candidates_exhausted,
        (SELECT COUNT(*) FROM discovery_candidates
          WHERE retry_state = 'retry_scheduled' AND next_retry_at < ?5) AS discovery_candidates_overdue,
        (SELECT COUNT(*) FROM discovery_candidates
          WHERE retry_state = 'claimed' AND claimed_at < ?6) AS discovery_claims_stale,
        (SELECT COUNT(*)
         FROM skill_repo_eligibility AS review
         WHERE ${leaderboardStuckSql(7)}) AS leaderboard_approvals_stuck
    `, [
      sinceSec,
      nowSec - DIRTY_STUCK_SECONDS,
      nowSec - AI_STUCK_SECONDS,
      nowSec - RESERVED_STUCK_SECONDS,
      nowSec - CLAIM_STALE_SECONDS,
      nowSec - CLAIM_STALE_SECONDS,
      nowSec - RESERVED_STUCK_SECONDS,
      DECISION_EXCEPTION_JSON,
    ]),
    all<SyncJobRow>(db, `
      SELECT name, cron, stale_after_seconds, last_run_at, last_status, last_error
      FROM sync_jobs
      WHERE enabled = 1 AND name != 'daily-health-check'
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
    // The repositories behind the count, oldest review first, so the nightly
    // email names what to look at instead of only how many.
    all<LeaderboardApprovalRow>(db, `
      SELECT review.owner, review.repo, review.reviewed_at
      FROM skill_repo_eligibility AS review
      WHERE ${leaderboardStuckSql(1)}
      ORDER BY review.reviewed_at
      LIMIT 8
    `, [nowSec - RESERVED_STUCK_SECONDS]),
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
    rejectedJobs24h: numberValue(row.rejected_jobs_24h),
    staleReservedJobs: numberValue(row.stale_reserved_jobs),
    openFailedBatches: numberValue(row.open_failed_batches),
    discoveryCandidatesExhausted: numberValue(row.discovery_candidates_exhausted),
    discoveryCandidatesOverdue: numberValue(row.discovery_candidates_overdue),
    discoveryClaimsStale: numberValue(row.discovery_claims_stale),
    leaderboardApprovalsStuck: numberValue(row.leaderboard_approvals_stuck),
    leaderboardApprovalDetails: leaderboardApprovalRows.map(approval => ({
      owner: approval.owner,
      repo: approval.repo,
      reviewedAt: numberValue(approval.reviewed_at),
    })),
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

const X_READ_USD = 0.005

/**
 * Discovery health. Every figure here answers a spend question, because the
 * X API bills per post returned and the cap is finite.
 */
async function loadXDiscovery(
  db: D1Database,
  sinceSec: number,
  monthStartSec: number,
  nowSec: number,
): Promise<DailyHealthCheckSummary['xDiscovery']> {
  const cursor = await first<{
    budget_spent: number | null
    budget_day: string | null
    posts_read_total: number | null
  }>(db, `
    SELECT budget_spent, budget_day, posts_read_total
    FROM x_ingest_cursor WHERE query_key = 'discovery-v1'
  `)

  const today = new Date(nowSec * 1000).toISOString().slice(0, 10)
  const spentToday = cursor.budget_day === today ? numberValue(cursor.budget_spent) : 0

  const counts = await first<{
    posts_24h: number
    newest_posted_at: number | null
    month_posts: number
  }>(db, `
    SELECT
      COALESCE(SUM(first_seen_at >= ?1), 0) AS posts_24h,
      MAX(posted_at) AS newest_posted_at,
      COALESCE(SUM(first_seen_at >= ?2), 0) AS month_posts
    FROM x_posts
  `, [sinceSec, monthStartSec])

  const ledger = await first<{
    discovered_24h: number
    pending: number
    held: number
    stalled: number
  }>(db, `
    SELECT
      COALESCE(SUM(first_seen_at >= ?1), 0) AS discovered_24h,
      COALESCE(SUM(status = 'pending' AND held_reason IS NULL), 0) AS pending,
      COALESCE(SUM(held_reason IS NOT NULL), 0) AS held,
      COALESCE(SUM(status = 'submitted' AND submitted_at IS NOT NULL AND submitted_at < ?2), 0) AS stalled
    FROM discovery_ledger
  `, [sinceSec, nowSec - 6 * 3600])

  const skills = await first<{ total: number, recent: number }>(db, `
    SELECT COUNT(*) AS total, COALESCE(SUM(verified_at >= ?1), 0) AS recent
    FROM x_post_skills
  `, [sinceSec])

  const newest = numberValue(counts.newest_posted_at)
  const monthReads = numberValue(counts.month_posts)
  const verifiedTotal = numberValue(skills.total)

  return {
    budgetSpentToday: spentToday,
    budgetLimit: DAILY_DISCOVERY_READ_BUDGET,
    readsMonth: monthReads,
    estimatedUsdMonth: monthReads * X_READ_USD,
    // Budget exhausted is only a problem when the window was not finished:
    // that combination is what means the stream is outrunning the ingest.
    keepingUp: spentToday < DAILY_DISCOVERY_READ_BUDGET,
    cursorLagHours: newest > 0 ? (nowSec - newest) / 3600 : null,
    postsStored24h: numberValue(counts.posts_24h),
    reposDiscovered24h: numberValue(ledger.discovered_24h),
    verifiedSkillsTotal: verifiedTotal,
    verifiedSkills24h: numberValue(skills.recent),
    readsPerVerifiedSkill: verifiedTotal > 0 ? monthReads / verifiedTotal : null,
    ledgerPending: numberValue(ledger.pending),
    ledgerHeld: numberValue(ledger.held),
    ledgerStalled: numberValue(ledger.stalled),
  }
}

export async function buildDailyHealthCheck(
  db: D1Database,
  options: BuildDailyHealthCheckOptions = {},
): Promise<DailyHealthCheckSummary> {
  const now = options.now ?? new Date()
  const since = new Date(now.getTime() - DAY_MS)
  const sinceSec = Math.floor(since.getTime() / 1000)
  const monthStartSec = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000)
  const warnings: string[] = []

  const probeFetcher = options.fetcher ?? fetch
  const frontDoor = await capture(warnings, 'front door', { checks: [] }, () => loadFrontDoor(probeFetcher))
  const trendingSkills = await capture(warnings, 'trending Skill pages', { checks: [] }, () => loadTrendingSkillPages(probeFetcher))
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
    newUsers24h: 0,
    digestsSent24h: 0,
    digestsFailed24h: 0,
    emailClicks: { fromDay: since.toISOString().slice(0, 10), weekly: 0, digest: 0 },
    weekly: null,
  }, () => loadActivity(db, sinceSec, warnings))
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
    rejectedJobs24h: 0,
    staleReservedJobs: 0,
    openFailedBatches: 0,
    discoveryCandidatesExhausted: 0,
    discoveryCandidatesOverdue: 0,
    discoveryClaimsStale: 0,
    leaderboardApprovalsStuck: 0,
    leaderboardApprovalDetails: [],
    failedJobDetails: [],
  }, () => loadPipeline(db, Math.floor(now.getTime() / 1000), sinceSec))
  const cost = await capture(warnings, 'AI cost', {
    estimatedAiUsd24h: 0,
    estimatedAiUsdMonth: 0,
  }, () => loadCost(db, sinceSec, monthStartSec))
  const xDiscovery = await capture(warnings, 'X discovery', {
    budgetSpentToday: 0,
    budgetLimit: DAILY_DISCOVERY_READ_BUDGET,
    readsMonth: 0,
    estimatedUsdMonth: 0,
    keepingUp: true,
    cursorLagHours: null,
    postsStored24h: 0,
    reposDiscovered24h: 0,
    verifiedSkillsTotal: 0,
    verifiedSkills24h: 0,
    readsPerVerifiedSkill: null,
    ledgerPending: 0,
    ledgerHeld: 0,
    ledgerStalled: 0,
  }, () => loadXDiscovery(db, sinceSec, monthStartSec, Math.floor(now.getTime() / 1000)))

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
    trendingSkills,
    inventory,
    activity,
    pipeline,
    cost,
    xDiscovery,
    credentials,
  }
  const evaluated = evaluateDailyHealthStatus(withoutStatus)
  return { ...withoutStatus, ...evaluated }
}
