import { readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readBoundedResponseText, runCheckCommand } from '@harlan-zw/nuxt-checkin/external'
import { buildHealthEmailQuery, buildWorkersQuery, parseHealthEmailRows, parseWorkflowName, runListArgs, summarizeWorkflowRuns } from './observability.mjs'

const resources = Object.fromEntries(['github-auth', 'production-ref', 'git', 'deploy', 'ci', 'd1', 'workers'].map(key => [key, {}]))

function collect(context, key, load) {
  return context.collect(resources[key], `skilld.${key}`, async signal => ({ value: await load({ ...context, signal }) }))
}

async function run(context, command, args) {
  const baseEnv = { ...context.env, NO_COLOR: '1' }
  const env = command === 'git' || command === 'gh'
    ? await collect(context, 'github-auth', async (context) => {
        if (!(baseEnv.GITHUB_TOKEN || baseEnv.GH_TOKEN))
          return baseEnv
        const probe = await runCheckCommand({ ...context, env: baseEnv }, 'gh', ['api', 'user'])
        if (probe._tag === 'Ok')
          return baseEnv
        // A stale environment token overrides a valid keyring login.
        const { GITHUB_TOKEN: _token, GH_TOKEN: _altToken, ...keyringEnv } = baseEnv
        return keyringEnv
      })
    : baseEnv
  const result = await runCheckCommand({ ...context, env }, command, args, { maxBytes: 20 * 1024 * 1024 })
  if (result._tag === 'Err')
    throw new Error(result.reason)
  return result.stdout.trim()
}
async function commandJson(context, command, args) {
  return JSON.parse(await run(context, command, args))
}
export function collectProduction(context) {
  return collect(context, 'production-ref', async (context) => {
    await run(context, 'git', ['fetch', 'origin', 'main'])
    return { ref: 'origin/main' }
  })
}
export function collectGit(context) {
  return collect(context, 'git', async (context) => {
    const production = await collectProduction(context)
    const commits = (await run(context, 'git', ['log', `--since=${context.since.toISOString()}`, '--pretty=format:%H%x09%aI%x09%s'])).split('\n').filter(Boolean).map((line) => {
      const [sha, authoredAt, ...subject] = line.split('\t')
      return { sha, authoredAt, subject: subject.join('\t') }
    })
    return { branch: await run(context, 'git', ['branch', '--show-current']), head: await run(context, 'git', ['rev-parse', 'HEAD']), dirtyFiles: (await run(context, 'git', ['status', '--short'])).split('\n').filter(Boolean), commitsSinceLastRun: commits, productionRef: production }
  })
}
export function collectDeploy(context) {
  return collect(context, 'deploy', async (context) => {
    const production = await collectProduction(context)
    const deployments = await commandJson(context, join(context.rootDir, 'node_modules/.bin/wrangler'), ['deployments', 'list', '--json', '--config', 'wrangler.jsonc'])
    const latest = [...deployments].sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)))[0]
    return { latest: latest ? { id: latest.id, createdOn: latest.created_on, versionId: latest.versions?.find(version => version.percentage === 100)?.version_id ?? latest.versions?.[0]?.version_id ?? null, message: latest.annotations?.['workers/message'] ?? null, approxDeployedSha: latest.created_on ? await run(context, 'git', ['rev-list', '-1', `--before=${latest.created_on}`, production.ref]) : null } : null }
  })
}
async function readMigrations(context, production) {
  const migrationFiles = text => text.split('\n').map(path => path.slice('migrations/'.length)).filter(file => /^\d.*\.sql$/.test(file)).sort()
  const productionFiles = migrationFiles(await run(context, 'git', ['ls-tree', '--name-only', production.ref, 'migrations/']))
  const current = migrationFiles(await run(context, 'git', ['ls-tree', '--name-only', 'HEAD', 'migrations/']))
  const working = (await readdir(join(context.rootDir, 'migrations'))).filter(file => /^\d.*\.sql$/.test(file)).sort()
  return { localHead: productionFiles.at(-1) ?? null, uncommitted: working.filter(file => !current.includes(file)) }
}
export function collectCI(context) {
  return collect(context, 'ci', async (context) => {
    const directory = join(context.rootDir, '.github/workflows')
    const names = (await Promise.all((await readdir(directory)).filter(file => /\.ya?ml$/.test(file)).map(async file => parseWorkflowName(await readFile(join(directory, file), 'utf8'))))).filter(Boolean).sort()
    const rows = []
    for (const name of names) {
      let page = await commandJson(context, 'gh', runListArgs(name, 10))
      if (!page.some(row => row.status === 'completed' && row.conclusion !== 'skipped') && page.length === 10)
        page = await commandJson(context, 'gh', runListArgs(name, 100))
      rows.push(...page)
    }
    return { workflows: summarizeWorkflowRuns(rows, names), recent: (await commandJson(context, 'gh', runListArgs(null, 20))).slice(0, 10) }
  })
}
function readDailyBudget(root) {
  try {
    const src = readFileSync(join(root, 'shared/server/x-ingest.ts'), 'utf8')
    const match = src.match(/DAILY_DISCOVERY_READ_BUDGET\s*=\s*(\d+)/)
    return match ? Number(match[1]) : null
  }
  catch (error) {
    throw new Error('X discovery budget source is unavailable.', { cause: error })
  }
}
export function collectD1(context) {
  return collect(context, 'd1', async (context) => {
    const root = context.rootDir
    const now = context.now
    const sinceSec = Math.floor(context.since.getTime() / 1000)
    const sinceMs = context.since.getTime()
    const utcDay = now.toISOString().slice(0, 10)
    async function d1Query(sql) {
      const output = await commandJson(context, join(root, 'node_modules/.bin/wrangler'), ['d1', 'execute', 'DB', '--remote', '--json', '--config', 'wrangler.jsonc', '--command', sql])
      if (!output[0]?.success)
        throw new Error('D1 query did not succeed.')
      return output[0].results ?? []
    }
    const tableRows = (await d1Query(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`))
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
    const hasColumn = async (table, column) => {
      if (!tables.has(table))
        return false
      if (!columnCache.has(table)) {
        columnCache.set(table, new Set((await d1Query(`SELECT name FROM pragma_table_info('${table}')`)).map(row => row.name)))
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
    // A count alone gives the 3-repo AMBER gate nothing to repair or prune, so
    // the identities behind `newly_broken_repos_impacted` are archived too: one
    // row per impacted repo with the reasons it still backs. The filter is shared
    // with the count so the number and the rows can never disagree.
    const impactedBrokenReposGuarded = has('repos') && has('skills') && has('user_starred_repos') && has('skill_subscriptions') && has('collection_skills_v2') && has('activity') && has('install_events')
    const impactedBrokenReposWhere = `r.broken_since >= ${sinceSec} AND (EXISTS (SELECT 1 FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo) OR EXISTS (SELECT 1 FROM user_starred_repos usr WHERE usr.owner = r.owner AND usr.repo = r.repo) OR EXISTS (SELECT 1 FROM skill_subscriptions sub WHERE sub.owner = r.owner AND sub.repo = r.repo) OR EXISTS (SELECT 1 FROM collection_skills_v2 cs WHERE cs.owner = r.owner AND cs.repo = r.repo) OR EXISTS (SELECT 1 FROM activity a JOIN install_events ie ON ie.slug = a.owner || '/' || a.name WHERE a.owner = r.owner AND a.repo = r.repo))`
    const pipelineParts = [
      has('repos') ? `(SELECT COUNT(*) FROM repos WHERE broken_since >= ${sinceSec}) AS newly_broken_repos_total` : 'NULL AS newly_broken_repos_total',
      impactedBrokenReposGuarded ? `(SELECT COUNT(*) FROM repos r WHERE ${impactedBrokenReposWhere}) AS newly_broken_repos_impacted` : 'NULL AS newly_broken_repos_impacted',
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
      const budgetTarget = readDailyBudget(root)
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
      (await hasColumn('x_posts', 'skills_scanned_at')) ? `(SELECT COUNT(*) FROM x_posts WHERE skills_scanned_at IS NULL) AS x_posts_unscanned` : 'NULL AS x_posts_unscanned',
      (await hasColumn('discovery_ledger', 'held_reason')) ? `(SELECT COUNT(*) FROM discovery_ledger WHERE status = 'pending' AND held_reason IS NULL) AS x_ledger_pending` : 'NULL AS x_ledger_pending',
      (await hasColumn('discovery_ledger', 'held_reason')) ? `(SELECT COUNT(*) FROM discovery_ledger WHERE held_reason IS NOT NULL) AS x_ledger_held` : 'NULL AS x_ledger_held',
      has('discovery_ledger') ? `(SELECT COUNT(*) FROM discovery_ledger WHERE status = 'submitted' AND submitted_at IS NOT NULL AND submitted_at < ${Math.floor(now.getTime() / 1000) - 21600}) AS x_ledger_stalled` : 'NULL AS x_ledger_stalled',
      has('discovery_ledger') ? `(SELECT COUNT(*) FROM discovery_ledger WHERE status = 'indexed') AS x_ledger_indexed` : 'NULL AS x_ledger_indexed',
    ]
    const impactedBrokenRepos = impactedBrokenReposGuarded
      ? (await d1Query(`SELECT r.owner, r.repo, rtrim((CASE WHEN EXISTS (SELECT 1 FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo) THEN 'skill ' ELSE '' END) || (CASE WHEN EXISTS (SELECT 1 FROM user_starred_repos usr WHERE usr.owner = r.owner AND usr.repo = r.repo) THEN 'star ' ELSE '' END) || (CASE WHEN EXISTS (SELECT 1 FROM skill_subscriptions sub WHERE sub.owner = r.owner AND sub.repo = r.repo) THEN 'subscription ' ELSE '' END) || (CASE WHEN EXISTS (SELECT 1 FROM collection_skills_v2 cs WHERE cs.owner = r.owner AND cs.repo = r.repo) THEN 'collection ' ELSE '' END) || (CASE WHEN EXISTS (SELECT 1 FROM activity a JOIN install_events ie ON ie.slug = a.owner || '/' || a.name WHERE a.owner = r.owner AND a.repo = r.repo) THEN 'install ' ELSE '' END)) AS reason FROM repos r WHERE ${impactedBrokenReposWhere} ORDER BY r.broken_since DESC`))
      : null
    const syncJobs = has('sync_jobs')
      ? (await d1Query(`SELECT name, cron, stale_after_seconds, last_run_at, last_status, last_error FROM sync_jobs WHERE enabled = 1 ORDER BY name`))
      : null
    const failedJobFingerprints = has('failed_jobs')
      ? (await d1Query(`SELECT queue, job_type, substr(exception, 1, 160) exception, COUNT(*) count, MIN(failed_at) first_failed_at, MAX(failed_at) last_failed_at FROM failed_jobs WHERE failed_at >= ${sinceSec} GROUP BY queue, job_type, substr(exception, 1, 160) ORDER BY count DESC LIMIT 10`))
      : null
    const healthEmail = has('daily_health_checks')
      ? parseHealthEmailRows((await d1Query(buildHealthEmailQuery())))
      : null
    const recentJobBatches = has('job_batches')
      ? (await d1Query(`SELECT id, name, total_jobs, pending_jobs, failed_jobs, created_at, updated_at, finished_at FROM job_batches ORDER BY updated_at DESC LIMIT 10`))
      : null
    const registryMaintenance = has('registry_maintenance')
      ? (await d1Query(`SELECT name, status, batch_id, updated_at, last_error FROM registry_maintenance ORDER BY updated_at DESC`))
      : null
    const prodMigrationHead = has('d1_migrations')
      ? (await d1Query(`SELECT MAX(name) name FROM d1_migrations`))[0]?.name ?? null
      : null
    // Production can be checked from a feature worktree. Compare D1 with the
    // production branch, while keeping worktree-only migrations visible.
    //
    // A failed `git fetch` leaves `migrations` as `{ error }` with neither
    // `localHead` nor `prodHead`, so the drift gate cannot misread a fetch
    // failure as drift. A 2026-09-03 silently failed fetch archived drift that
    // did not exist.
    const migrations = await collectProduction(context).then(async production => ({ ...(await readMigrations(context, production)), prodHead: prodMigrationHead })).catch(error => ({ error: error.message }))
    return {
      tables: [...tables],
      inventory: (await d1Query(`SELECT ${inventoryParts.join(', ')}`))[0],
      activity: (await d1Query(`SELECT ${activityParts.join(', ')}`))[0],
      pipeline: {
        ...(await d1Query(`SELECT ${pipelineParts.join(', ')}`))[0],
        newly_broken_repos_impacted_identities: impactedBrokenRepos,
      },
      cost: withXSpend((await d1Query(`SELECT ${costParts.join(', ')}`))[0]),
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
}
export function collectWorkers(context) {
  return collect(context, 'workers', async (context) => {
    const token = context.env.CLOUDFLARE_USAGE_TOKEN || context.env.CLOUDFLARE_API_TOKEN || context.env.CF_API_TOKEN || (await commandJson(context, join(context.rootDir, 'node_modules/.bin/wrangler'), ['auth', 'token', '--json'])).token
    if (!token)
      throw new Error('Cloudflare token is unavailable.')
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', redirect: 'error', signal: context.signal, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: buildWorkersQuery(context.since.toISOString(), context.now.toISOString()) }) })
    const body = JSON.parse(await readBoundedResponseText(response, 2_097_152))
    if (!response.ok || body.errors?.length)
      throw new Error(`Cloudflare GraphQL returned HTTP ${response.status}.`)
    const rows = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive
    if (!Array.isArray(rows))
      throw new Error('Cloudflare Worker evidence is unavailable.')
    const outcomes = {}
    for (const row of rows) {
      if (row.dimensions.scriptName === 'skilld-dev')
        outcomes[row.dimensions.status] = (outcomes[row.dimensions.status] ?? 0) + row.sum.requests
    }
    return { outcomes, nonOk: Object.entries(outcomes).filter(([status]) => !['success', 'clientDisconnected', 'responseStreamDisconnected'].includes(status)).map(([status, requests]) => ({ status, requests })) }
  })
}
