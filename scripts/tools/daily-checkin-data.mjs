#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  approximateDeployedSha,
  buildWorkersQuery,
  collectWorkflowRuns,
  parseHealthEmailRows,
  parseWorkflowName,
  readMigrationState,
  refreshProductionRef,
  summarizeWorkflowRuns,
} from './daily-checkin-observability.mjs'
import { ghEnv, runReadOnlyProcess } from './daily-checkin-process.mjs'
import { parseSentryIssuesResponse } from './sentry-observability.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const checkinDir = join(root, 'docs/ops/checkins')
const statePath = join(checkinDir, 'state.json')
const save = process.argv.includes('--save')
const now = new Date()
const defaultSince = new Date(now.getTime() - 24 * 60 * 60 * 1000)
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null
const since = new Date(state?.lastRunAt || defaultSince)
const sinceIso = since.toISOString()
const sinceSec = Math.floor(since.getTime() / 1000)
const sinceMs = since.getTime()
// X deduplicates read charges per UTC day, so its budget counter is keyed on
// the UTC date rather than on the check-in window.
const utcDay = now.toISOString().slice(0, 10)
const wrangler = join(root, 'node_modules/.bin/wrangler')

// The gh environment is resolved lazily and once per process: deciding it
// costs a real API call, and the ci probe alone invokes gh once per workflow.
let ghEnvironment
function run(command, args, options = {}) {
  const baseEnv = { ...process.env, NO_COLOR: '1' }
  if (command === 'gh')
    ghEnvironment ??= ghEnv(baseEnv, spawnSync)
  return runReadOnlyProcess(spawnSync, command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: command === 'gh' ? ghEnvironment : baseEnv,
  })
}

function probe(load) {
  try {
    return load()
  }
  catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function probeAsync(load) {
  return await load().catch(error => ({ error: error instanceof Error ? error.message : String(error) }))
}

function commandJson(command, args) {
  return JSON.parse(run(command, args))
}

function d1Query(sql) {
  const output = commandJson(wrangler, [
    'd1',
    'execute',
    'DB',
    '--remote',
    '--json',
    '--config',
    'wrangler.jsonc',
    '--command',
    sql,
  ])
  const statement = output[0]
  if (!statement?.success)
    throw new Error('D1 query did not succeed')
  return statement.results ?? []
}

// One fetch per run, shared by every production read. A failed fetch becomes
// a probe error here, so no read below can compare against a stale ref.
const production = probe(() => refreshProductionRef(args => run('git', args)))

const git = probe(() => {
  const dirty = run('git', ['status', '--short']).split('\n').filter(Boolean)
  const commits = run('git', ['log', `--since=${sinceIso}`, '--pretty=format:%H%x09%aI%x09%s'])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, authoredAt, ...subject] = line.split('\t')
      return { sha, authoredAt, subject: subject.join('\t') }
    })
  return {
    branch: run('git', ['branch', '--show-current']),
    head: run('git', ['rev-parse', 'HEAD']),
    dirtyFiles: dirty,
    commitsSinceLastRun: commits,
    productionRef: production,
  }
})

const deploy = probe(() => {
  const deployments = commandJson(wrangler, ['deployments', 'list', '--json', '--config', 'wrangler.jsonc'])
  const latest = [...deployments].sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)))[0] ?? null
  return {
    latest: latest && {
      id: latest.id,
      createdOn: latest.created_on,
      versionId: latest.versions?.find(version => version.percentage === 100)?.version_id ?? latest.versions?.[0]?.version_id ?? null,
      message: latest.annotations?.['workers/message'] ?? null,
      approxDeployedSha: 'error' in production ? null : approximateDeployedSha(args => run('git', args), production, latest.created_on),
    },
  }
})

const runFields = 'databaseId,workflowName,displayTitle,headSha,status,conclusion,createdAt,updatedAt,url'

const ci = probe(() => {
  const workflowDir = join(root, '.github/workflows')
  const definedWorkflows = readdirSync(workflowDir)
    .filter(file => /\.ya?ml$/.test(file))
    .map(file => parseWorkflowName(readFileSync(join(workflowDir, file), 'utf8')))
    .filter(Boolean)
    .sort()
  // A low-cadence workflow can fall outside a flat recent-runs page, and an
  // absent row reads as `missing`, which is an observability gap rather than a
  // health signal. Each workflow is therefore paged on its own name, and paged
  // deeper when a run of skipped guard runs hides the last verdict.
  const perWorkflowRows = collectWorkflowRuns(
    (name, limit) => commandJson('gh', ['run', 'list', '--workflow', name, '--limit', String(limit), '--json', runFields]),
    definedWorkflows,
  )
  const recent = commandJson('gh', ['run', 'list', '--limit', '20', '--json', runFields])
  return {
    workflows: summarizeWorkflowRuns(perWorkflowRows, definedWorkflows),
    recent: recent.slice(0, 10),
  }
})

// Loop 1 front door only. `/guides` was probed until 2026-08-04 and was dropped
// when guides were retired; it now answers 410 by design, so a 200 there would be
// the regression. Removing a probe silently reads as a passing probe, so any future
// removal belongs here in writing.
const http = await probeAsync(async () => {
  const entries = await Promise.all([
    'https://skilld.dev/',
    'https://skilld.dev/skills',
  ].map(async (url) => {
    // A transport failure is itself a front-door result, so it becomes a null
    // status the report prints rather than an exception that kills the probe.
    const hit = async () => await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    }).then(response => response.status).catch((error) => {
      console.warn(`[http] ${url} ${error instanceof Error ? error.message : String(error)}`)
      return null
    })
    const firstAttempt = await hit()
    if (firstAttempt === 200)
      return [url, 200]
    const status = await hit()
    return [url, status === firstAttempt ? status : { status, firstAttempt }]
  }))
  return Object.fromEntries(entries)
})

/**
 * Pull DAILY_DISCOVERY_READ_BUDGET out of the source of truth. Returns null
 * rather than a guess when the constant cannot be found, so a rename surfaces
 * as a missing number instead of a confidently wrong one.
 */
function readDailyBudget() {
  try {
    const src = readFileSync(join(root, 'shared/server/x-ingest.ts'), 'utf8')
    const match = src.match(/DAILY_DISCOVERY_READ_BUDGET\s*=\s*(\d+)/)
    return match ? Number(match[1]) : null
  }
  catch {
    return null
  }
}

const d1 = probe(() => {
  const tableRows = d1Query(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
  const tables = new Set(tableRows.map(row => row.name))
  const has = table => tables.has(table)

  /**
   * Column-level guard. `has(table)` is not enough: a migration that adds a
   * column ships in the code before it is applied to production, and a query
   * naming the new column fails the whole d1 probe. That silently blanked the
   * entire checkin the first time `skills_scanned_at` was referenced, which is
   * the worst possible failure for the tool that reports failures.
   */
  const columnCache = new Map()
  const hasColumn = (table, column) => {
    if (!tables.has(table))
      return false
    if (!columnCache.has(table)) {
      columnCache.set(
        table,
        new Set(d1Query(`SELECT name FROM pragma_table_info('${table}')`).map(row => row.name)),
      )
    }
    return columnCache.get(table).has(column)
  }

  const inventoryParts = [
    has('skills') ? `(SELECT COUNT(*) FROM skills) AS skills` : 'NULL AS skills',
    has('repos') ? `(SELECT COUNT(*) FROM repos) AS repos` : 'NULL AS repos',
    has('owners') ? `(SELECT COUNT(*) FROM owners) AS owners` : 'NULL AS owners',
    has('users') ? `(SELECT COUNT(*) FROM users) AS users` : 'NULL AS users',
    has('collections_v2') ? `(SELECT COUNT(*) FROM collections_v2 WHERE deleted_at IS NULL) AS collections` : 'NULL AS collections',
    has('repos') ? `(SELECT COUNT(*) FROM repos WHERE broken_since IS NOT NULL) AS broken_repos` : 'NULL AS broken_repos',
  ]
  const activityParts = [
    has('skills') ? `(SELECT COUNT(*) FROM skills WHERE first_seen_at >= ${sinceSec}) AS new_skills` : 'NULL AS new_skills',
    has('activity') ? `(SELECT COUNT(DISTINCT owner || '/' || repo) FROM activity WHERE occurred_at >= ${sinceSec}) AS changed_repos` : 'NULL AS changed_repos',
    has('install_events') ? `(SELECT COUNT(*) FROM install_events WHERE occurred_at >= ${sinceMs}) AS install_events` : 'NULL AS install_events',
    has('users') ? `(SELECT COUNT(*) FROM users WHERE created_at >= ${sinceSec}) AS new_users` : 'NULL AS new_users',
    has('digest_runs') ? `(SELECT COUNT(*) FROM digest_runs WHERE status = 'sent' AND sent_at >= ${sinceSec}) AS digests_sent` : 'NULL AS digests_sent',
    has('digest_runs') ? `(SELECT COUNT(*) FROM digest_runs WHERE status = 'failed' AND window_end >= ${sinceSec}) AS digests_failed` : 'NULL AS digests_failed',
  ]
  const pipelineParts = [
    has('repos') ? `(SELECT COUNT(*) FROM repos WHERE broken_since >= ${sinceSec}) AS newly_broken_repos_total` : 'NULL AS newly_broken_repos_total',
    has('repos') && has('skills') && has('user_starred_repos') && has('skill_subscriptions') && has('collection_skills_v2') && has('activity') && has('install_events')
      ? `(SELECT COUNT(*) FROM repos r WHERE r.broken_since >= ${sinceSec} AND (EXISTS (SELECT 1 FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo) OR EXISTS (SELECT 1 FROM user_starred_repos usr WHERE usr.owner = r.owner AND usr.repo = r.repo) OR EXISTS (SELECT 1 FROM skill_subscriptions sub WHERE sub.owner = r.owner AND sub.repo = r.repo) OR EXISTS (SELECT 1 FROM collection_skills_v2 cs WHERE cs.owner = r.owner AND cs.repo = r.repo) OR EXISTS (SELECT 1 FROM activity a JOIN install_events ie ON ie.slug = a.owner || '/' || a.name WHERE a.owner = r.owner AND a.repo = r.repo))) AS newly_broken_repos_impacted`
      : 'NULL AS newly_broken_repos_impacted',
    has('skills') ? `(SELECT COUNT(*) FROM skills WHERE sync_status IS NOT NULL AND sync_status != 'ok' AND last_synced_at >= ${sinceSec}) AS skill_sync_failures` : 'NULL AS skill_sync_failures',
    has('skill_dirty') ? `(SELECT COUNT(*) FROM skill_dirty WHERE queued_at < ${Math.floor(now.getTime() / 1000) - 3600}) AS stale_dirty_skills` : 'NULL AS stale_dirty_skills',
    // `ai_batches` covers the Anthropic batch pipeline only, and embeddings never
    // touch it, so these three read 0 while `HAIKU_GENERATION_PAUSED` holds. The
    // embedding counters below are the ones that move; reading an AI-pipeline
    // verdict off `ai_submitted` alone produced a wrong diagnosis on 2026-08-03.
    has('ai_batches') ? `(SELECT COUNT(*) FROM ai_batches WHERE status = 'submitted') AS ai_submitted` : 'NULL AS ai_submitted',
    has('ai_batches') ? `(SELECT COUNT(*) FROM ai_batches WHERE status = 'submitted' AND submitted_at < ${Math.floor(now.getTime() / 1000) - 10800}) AS ai_stuck` : 'NULL AS ai_stuck',
    has('ai_batches') ? `(SELECT COUNT(*) FROM ai_batches WHERE status IN ('failed','expired') AND COALESCE(completed_at, submitted_at) >= ${sinceSec}) AS ai_failed` : 'NULL AS ai_failed',
    has('embedding_attempts') ? `(SELECT COUNT(*) FROM embedding_attempts WHERE state = 'completed' AND started_at >= ${sinceSec}) AS embeddings_completed` : 'NULL AS embeddings_completed',
    has('embedding_attempts') ? `(SELECT COUNT(*) FROM embedding_attempts WHERE state IN ('provider_failed','rejected','vector_succeeded_marker_failed') AND started_at >= ${sinceSec}) AS embeddings_failed` : 'NULL AS embeddings_failed',
    // Bounded below at 7 days: `started` rows abandoned by a closed incident
    // otherwise read as a live fault forever (6 rows from Jul 23/29 did exactly
    // that on 2026-08-04). A row stuck past 7 days is history, not an incident.
    has('embedding_attempts') ? `(SELECT COUNT(*) FROM embedding_attempts WHERE state = 'started' AND started_at < ${Math.floor(now.getTime() / 1000) - 3600} AND started_at >= ${Math.floor(now.getTime() / 1000) - 604800}) AS embeddings_stuck` : 'NULL AS embeddings_stuck',
    has('failed_jobs') ? `(SELECT COUNT(*) FROM failed_jobs WHERE failed_at >= ${sinceSec}) AS failed_jobs` : 'NULL AS failed_jobs',
    has('jobs') ? `(SELECT COUNT(*) FROM jobs WHERE reserved_at IS NOT NULL AND reserved_at < ${Math.floor(now.getTime() / 1000) - 900} AND completed_at IS NULL AND failed_at IS NULL) AS stale_reserved_jobs` : 'NULL AS stale_reserved_jobs',
  ]
  /**
   * Turn raw X read counts into the number that matters: dollars, and whether
   * the month is on track. Reads are $0.005 each with no included allowance.
   *
   * The budget is read out of shared/server/x-ingest.ts rather than copied.
   * This script is plain node and cannot import the app's module graph, and a
   * hand-copied constant had already gone stale once, reporting 22 while the
   * real budget was 400 and so claiming the ingest was massively over budget.
   */
  function withXSpend(costRow) {
    const USD_PER_READ = 0.005
    const budgetTarget = readDailyBudget()
    const row = costRow ?? {}
    const discoveryToday = Number(row.x_discovery_reads_today ?? 0)
    const hot = Number(row.x_hot_posts ?? 0)
    // Refresh only pays for a hot post again when its window crosses midnight.
    // Treating every hot post as one more charge is the pessimistic bound.
    const projectedDaily = discoveryToday + hot
    return {
      ...row,
      x_budget_target: budgetTarget,
      x_budget_used_pct: budgetTarget > 0 ? Math.round((discoveryToday / budgetTarget) * 100) : null,
      x_projected_daily_reads: projectedDaily,
      x_projected_monthly_usd: Math.round(projectedDaily * 30 * USD_PER_READ * 100) / 100,
      x_over_budget: discoveryToday > budgetTarget,
      // The value question: reads bought per skill actually verified. Rising
      // means the query is getting less precise or the stream is noisier.
      x_reads_per_verified_skill: Number(row.x_verified_skills ?? 0) > 0
        ? Math.round(Number(row.x_discovery_reads_total ?? 0) / Number(row.x_verified_skills))
        : null,
      // Budget spent without finishing the window means the stream is
      // outrunning the ingest and the backlog grows daily.
      x_falling_behind: discoveryToday >= budgetTarget,
    }
  }

  const costParts = [
    has('ai_batch_costs') ? `(SELECT COALESCE(SUM(est_cost_usd), 0) FROM ai_batch_costs WHERE submitted_at >= ${sinceSec}) AS ai_cost_usd` : 'NULL AS ai_cost_usd',
    // X is pay-per-use with no included allowance: every post read is a real
    // $0.005 invoice line, so it belongs in the health report rather than only
    // in task logs. `budget_spent` counts today only when `budget_day` matches;
    // a stale day reads as 0, matching how the ingest resets it.
    has('x_ingest_cursor') ? `(SELECT COALESCE(SUM(CASE WHEN budget_day = '${utcDay}' THEN budget_spent ELSE 0 END), 0) FROM x_ingest_cursor) AS x_discovery_reads_today` : 'NULL AS x_discovery_reads_today',
    has('x_ingest_cursor') ? `(SELECT COALESCE(SUM(posts_read_total), 0) FROM x_ingest_cursor) AS x_discovery_reads_total` : 'NULL AS x_discovery_reads_total',
    // Hot posts are refresh's remaining exposure: each can cost at most one
    // more read, when its window crosses midnight UTC.
    has('x_posts') ? `(SELECT COUNT(*) FROM x_posts WHERE refresh_tier = 'hot') AS x_hot_posts` : 'NULL AS x_hot_posts',
    has('x_posts') ? `(SELECT COUNT(*) FROM x_posts WHERE first_seen_at >= ${sinceSec}) AS x_posts_24h` : 'NULL AS x_posts_24h',
    // How stale the freshest ingested post is. Climbs when discovery lags.
    has('x_posts') ? `(SELECT CAST((${Math.floor(now.getTime() / 1000)} - MAX(posted_at)) / 3600 AS INTEGER) FROM x_posts) AS x_newest_post_age_hours` : 'NULL AS x_newest_post_age_hours',
    has('x_post_skills') ? `(SELECT COUNT(*) FROM x_post_skills) AS x_verified_skills` : 'NULL AS x_verified_skills',
    has('x_post_skills') ? `(SELECT COUNT(*) FROM x_post_skills WHERE verified_at >= ${sinceSec}) AS x_verified_skills_24h` : 'NULL AS x_verified_skills_24h',
    hasColumn('x_posts', 'skills_scanned_at') ? `(SELECT COUNT(*) FROM x_posts WHERE skills_scanned_at IS NULL) AS x_posts_unscanned` : 'NULL AS x_posts_unscanned',
    hasColumn('discovery_ledger', 'held_reason') ? `(SELECT COUNT(*) FROM discovery_ledger WHERE status = 'pending' AND held_reason IS NULL) AS x_ledger_pending` : 'NULL AS x_ledger_pending',
    hasColumn('discovery_ledger', 'held_reason') ? `(SELECT COUNT(*) FROM discovery_ledger WHERE held_reason IS NOT NULL) AS x_ledger_held` : 'NULL AS x_ledger_held',
    has('discovery_ledger') ? `(SELECT COUNT(*) FROM discovery_ledger WHERE status = 'submitted' AND submitted_at IS NOT NULL AND submitted_at < ${Math.floor(now.getTime() / 1000) - 21600}) AS x_ledger_stalled` : 'NULL AS x_ledger_stalled',
    has('discovery_ledger') ? `(SELECT COUNT(*) FROM discovery_ledger WHERE status = 'indexed') AS x_ledger_indexed` : 'NULL AS x_ledger_indexed',
  ]

  const syncJobs = has('sync_jobs')
    ? d1Query(`SELECT name, cron, stale_after_seconds, last_run_at, last_status, last_error FROM sync_jobs WHERE enabled = 1 ORDER BY name`)
    : null
  const failedJobFingerprints = has('failed_jobs')
    ? d1Query(`SELECT queue, job_type, substr(exception, 1, 160) exception, COUNT(*) count, MIN(failed_at) first_failed_at, MAX(failed_at) last_failed_at FROM failed_jobs WHERE failed_at >= ${sinceSec} GROUP BY queue, job_type, substr(exception, 1, 160) ORDER BY count DESC LIMIT 10`)
    : null
  const healthEmail = has('daily_health_checks')
    ? parseHealthEmailRows(d1Query(`SELECT report_date, health_status, delivery_status, recipient, sent_at, error, summary_json FROM daily_health_checks ORDER BY report_date DESC LIMIT 2`))
    : null
  const recentJobBatches = has('job_batches')
    ? d1Query(`SELECT id, name, total_jobs, pending_jobs, failed_jobs, created_at, updated_at, finished_at FROM job_batches ORDER BY updated_at DESC LIMIT 10`)
    : null
  const registryMaintenance = has('registry_maintenance')
    ? d1Query(`SELECT name, status, batch_id, updated_at, last_error FROM registry_maintenance ORDER BY updated_at DESC`)
    : null
  const prodMigrationHead = has('d1_migrations')
    ? d1Query(`SELECT MAX(name) name FROM d1_migrations`)[0]?.name ?? null
    : null
  // Production can be checked from a feature worktree. Compare D1 with the
  // production branch, while keeping worktree-only migrations visible.
  //
  // A failed `git fetch` leaves `migrations` as `{ error }` with neither
  // `localHead` nor `prodHead`, so the drift gate cannot misread a fetch
  // failure as drift. A 2026-09-03 silently failed fetch archived drift that
  // did not exist.
  const migrations = 'error' in production
    ? { error: production.error }
    : {
        ...readMigrationState(
          args => run('git', args),
          production,
          readdirSync(join(root, 'migrations')),
        ),
        prodHead: prodMigrationHead,
      }

  return {
    tables: [...tables],
    inventory: d1Query(`SELECT ${inventoryParts.join(', ')}`)[0],
    activity: d1Query(`SELECT ${activityParts.join(', ')}`)[0],
    pipeline: d1Query(`SELECT ${pipelineParts.join(', ')}`)[0],
    cost: withXSpend(d1Query(`SELECT ${costParts.join(', ')}`)[0]),
    syncJobs,
    failedJobFingerprints,
    healthEmail,
    recentJobBatches,
    registryMaintenance,
    migrations,
    missingExpectedTables: [
      'skills',
      'repos',
      'owners',
      'users',
      'activity',
      'install_events',
      'sync_jobs',
      'jobs',
      'failed_jobs',
      'daily_health_checks',
    ].filter(table => !has(table)),
  }
})

function cloudflareToken() {
  const environmentToken = process.env.CLOUDFLARE_USAGE_TOKEN || process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN
  if (environmentToken)
    return environmentToken
  const auth = commandJson(wrangler, ['auth', 'token', '--json'])
  if (!auth.token)
    throw new Error('Cloudflare token unavailable')
  return auth.token
}

const workers = await probeAsync(async () => {
  const query = buildWorkersQuery(sinceIso, now.toISOString())
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cloudflareToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await response.json()
  if (!response.ok || body.errors?.length)
    throw new Error(`Cloudflare GraphQL ${response.status}: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`)
  const rows = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? []
  const outcomes = {}
  for (const row of rows) {
    if (row.dimensions.scriptName !== 'skilld-dev')
      continue
    const status = row.dimensions.status
    outcomes[status] = (outcomes[status] ?? 0) + row.sum.requests
  }
  return {
    outcomes,
    nonOk: Object.entries(outcomes)
      .filter(([status]) => !['success', 'clientDisconnected', 'responseStreamDisconnected'].includes(status))
      .map(([status, requests]) => ({ status, requests })),
  }
})

// Token sources in descending order of read scope. `.env.sentry-build-plugin`
// holds the build-plugin token, which only carries source-map upload scope and
// 403s on the issues API, so it is the last resort rather than the first.
function sentryToken() {
  if (process.env.SENTRY_AUTH_TOKEN)
    return { token: process.env.SENTRY_AUTH_TOKEN, source: 'SENTRY_AUTH_TOKEN env' }

  const rcPath = join(homedir(), '.sentryclirc')
  if (existsSync(rcPath)) {
    const rcToken = readFileSync(rcPath, 'utf8').match(/^token\s*=\s*(\S+)/m)?.[1]
    if (rcToken)
      return { token: rcToken, source: '~/.sentryclirc' }
  }

  const buildPluginPath = join(root, '.env.sentry-build-plugin')
  if (existsSync(buildPluginPath)) {
    const buildToken = readFileSync(buildPluginPath, 'utf8').match(/^SENTRY_AUTH_TOKEN=(\S+)/m)?.[1]
    if (buildToken)
      return { token: buildToken, source: '.env.sentry-build-plugin' }
  }

  return null
}

// Recurrences now share the page with new issues, so the cap has to hold
// both. `truncatedAtLimit` reports when it did not.
const SENTRY_ISSUE_LIMIT = 25

const sentry = await (async () => {
  const resolved = sentryToken()
  if (!resolved) {
    return {
      _tag: 'missing_observability',
      status: null,
      diagnostic: 'No Sentry token found in SENTRY_AUTH_TOKEN, ~/.sentryclirc, or .env.sentry-build-plugin.',
    }
  }
  const { token, source: tokenSource } = resolved
  // `lastSeen` catches an issue that fired again on an id we already know;
  // `firstSeen` could only ever report births, which is how 686 post-deploy
  // errors reached the 2026-08-06 archive as silence.
  const query = encodeURIComponent(`project:skilld is:unresolved lastSeen:>${sinceIso.slice(0, 19)}`)
  const response = await fetch(`https://sentry.io/api/0/organizations/harlan-zw/issues/?query=${query}&sort=freq&limit=${SENTRY_ISSUE_LIMIT}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(error => ({
    networkError: error instanceof Error ? error.message : String(error),
  }))
  if ('networkError' in response) {
    return {
      _tag: 'provider_failure',
      status: null,
      diagnostic: `Sentry issues request failed: ${response.networkError}`,
    }
  }
  const issues = await response.json().catch(error => ({
    parseError: error instanceof Error ? error.message : String(error),
  }))
  if (issues?.parseError) {
    return {
      _tag: 'parse_failure',
      status: response.status,
      diagnostic: `Sentry issues response was not JSON: ${issues.parseError}`,
    }
  }
  return parseSentryIssuesResponse(response.status, issues, tokenSource, sinceIso, SENTRY_ISSUE_LIMIT)
})().catch(error => ({
  _tag: 'provider_failure',
  status: null,
  diagnostic: error instanceof Error ? error.message : String(error),
}))

const doc = {
  generatedAt: now.toISOString(),
  since: sinceIso,
  git,
  deploy,
  ci,
  http,
  d1,
  workers,
  sentry,
}

console.log(JSON.stringify(doc, null, 2))

const failedProbes = Object.entries({ git, deploy, ci, http, d1, workers, sentry }).filter(([name, value]) =>
  value?.error || (name === 'sentry' && value?._tag !== 'available'),
)
if (failedProbes.length)
  console.error(`WARN ${failedProbes.length} probes failed: ${failedProbes.map(([name]) => name).join(', ')}. Missing data is not health.`)

if (save) {
  mkdirSync(checkinDir, { recursive: true })
  const archivePath = join(checkinDir, `${now.toISOString().slice(0, 10)}.json`)
  if (existsSync(archivePath)) {
    const time = now.toISOString().slice(11, 16).replace(':', '')
    const rerunPath = archivePath.replace(/\.json$/, `.rerun-${time}.json`)
    writeFileSync(rerunPath, `${JSON.stringify(doc, null, 2)}\n`)
    console.error(`Same-day rerun wrote ${rerunPath}. The morning baseline and state were not changed.`)
  }
  else {
    writeFileSync(archivePath, `${JSON.stringify(doc, null, 2)}\n`)
    if (!d1.error)
      writeFileSync(statePath, `${JSON.stringify({ lastRunAt: now.toISOString() }, null, 2)}\n`)
    else
      console.error('State was not advanced because the D1 probe failed.')
  }
}
