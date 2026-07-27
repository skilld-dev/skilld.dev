#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseHealthEmailRows,
  summarizeWorkflowRuns,
} from './daily-checkin-observability.mjs'
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
const wrangler = join(root, 'node_modules/.bin/wrangler')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
  if (result.status !== 0)
    throw new Error((result.stderr || result.stdout || `${command} exited ${result.status}`).trim().slice(0, 800))
  return result.stdout.trim()
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

function approximateSha(deployedAt) {
  if (!deployedAt)
    return null
  return run('git', ['rev-list', '-1', `--before=${deployedAt}`, 'HEAD']) || null
}

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
      approxDeployedSha: approximateSha(latest.created_on),
    },
  }
})

const ci = probe(() => {
  const rows = commandJson('gh', [
    'run',
    'list',
    '--limit',
    '20',
    '--json',
    'databaseId,workflowName,displayTitle,headSha,status,conclusion,createdAt,updatedAt,url',
  ])
  return {
    workflows: summarizeWorkflowRuns(rows, ['Test', 'Deploy to Cloudflare']),
    recent: rows.slice(0, 10),
  }
})

const http = await probeAsync(async () => {
  const entries = await Promise.all([
    'https://skilld.dev/',
    'https://skilld.dev/skills',
    'https://skilld.dev/guides',
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

const d1 = probe(() => {
  const tableRows = d1Query(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
  const tables = new Set(tableRows.map(row => row.name))
  const has = table => tables.has(table)

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
    has('ai_batches') ? `(SELECT COUNT(*) FROM ai_batches WHERE status = 'submitted') AS ai_submitted` : 'NULL AS ai_submitted',
    has('ai_batches') ? `(SELECT COUNT(*) FROM ai_batches WHERE status = 'submitted' AND submitted_at < ${Math.floor(now.getTime() / 1000) - 10800}) AS ai_stuck` : 'NULL AS ai_stuck',
    has('ai_batches') ? `(SELECT COUNT(*) FROM ai_batches WHERE status IN ('failed','expired') AND COALESCE(completed_at, submitted_at) >= ${sinceSec}) AS ai_failed` : 'NULL AS ai_failed',
    has('failed_jobs') ? `(SELECT COUNT(*) FROM failed_jobs WHERE failed_at >= ${sinceSec}) AS failed_jobs` : 'NULL AS failed_jobs',
    has('jobs') ? `(SELECT COUNT(*) FROM jobs WHERE reserved_at IS NOT NULL AND reserved_at < ${Math.floor(now.getTime() / 1000) - 900} AND completed_at IS NULL AND failed_at IS NULL) AS stale_reserved_jobs` : 'NULL AS stale_reserved_jobs',
  ]
  const costParts = [
    has('ai_batch_costs') ? `(SELECT COALESCE(SUM(est_cost_usd), 0) FROM ai_batch_costs WHERE submitted_at >= ${sinceSec}) AS ai_cost_usd` : 'NULL AS ai_cost_usd',
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
  const localMigrationHead = readdirSync(join(root, 'migrations')).filter(file => /^\d.*\.sql$/.test(file)).sort().at(-1) ?? null

  return {
    tables: [...tables],
    inventory: d1Query(`SELECT ${inventoryParts.join(', ')}`)[0],
    activity: d1Query(`SELECT ${activityParts.join(', ')}`)[0],
    pipeline: d1Query(`SELECT ${pipelineParts.join(', ')}`)[0],
    cost: d1Query(`SELECT ${costParts.join(', ')}`)[0],
    syncJobs,
    failedJobFingerprints,
    healthEmail,
    recentJobBatches,
    registryMaintenance,
    migrations: { localHead: localMigrationHead, prodHead: prodMigrationHead },
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
  const query = `query { viewer { accounts(filter: {accountTag: "5904138d55ca25d5670dca6adf99894e"}) { workersInvocationsAdaptive(limit: 100, filter: {datetime_geq: "${sinceIso}", datetime_leq: "${now.toISOString()}"}) { dimensions { scriptName status } sum { requests } } } } }`
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
  const query = encodeURIComponent(`project:skilld is:unresolved firstSeen:>${sinceIso.slice(0, 19)}`)
  const response = await fetch(`https://sentry.io/api/0/organizations/harlan-zw/issues/?query=${query}&sort=freq&limit=10`, {
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
  return parseSentryIssuesResponse(response.status, issues, tokenSource)
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
