const PRODUCTION_REF = 'origin/main'
const isMigration = file => /^\d.*\.sql$/.test(file)

function migrationFiles(tree) {
  return tree
    .split('\n')
    .map(path => path.slice('migrations/'.length))
    .filter(isMigration)
    .sort()
}

/**
 * Fetch `origin/main` and hand back the token every production read requires.
 *
 * `approximateDeployedSha` and `readMigrationState` both read the local
 * `origin/main` ref, so they are only as fresh as the last fetch. On 2026-09-03
 * a silently failed fetch left that ref stale: the run archived migration drift
 * that did not exist, and the deploy SHA read the same stale ref. Requiring the
 * token makes a stale read unrepresentable, and a failed fetch throws instead of
 * returning one, so the caller decides how to scope the error.
 */
export function refreshProductionRef(runGit) {
  runGit(['fetch', 'origin', 'main'])
  return { _tag: 'production', ref: PRODUCTION_REF }
}

export function approximateDeployedSha(runGit, production, deployedAt) {
  if (!deployedAt)
    return null
  return runGit(['rev-list', '-1', `--before=${deployedAt}`, production.ref]) || null
}

export function readMigrationState(runGit, production, workingTreeMigrations) {
  const productionMigrations = migrationFiles(
    runGit(['ls-tree', '--name-only', production.ref, 'migrations/']),
  )
  const currentMigrations = migrationFiles(
    runGit(['ls-tree', '--name-only', 'HEAD', 'migrations/']),
  )
  const workingMigrations = workingTreeMigrations.filter(isMigration).sort()

  return {
    localHead: productionMigrations.at(-1) ?? null,
    uncommitted: workingMigrations.filter(file => !currentMigrations.includes(file)),
  }
}

export function buildWorkersQuery(sinceIso, untilIso) {
  return `query { viewer { accounts(filter: {accountTag: "5904138d55ca25d5670dca6adf99894e"}) { workersInvocationsAdaptive(limit: 100, filter: {scriptName: "skilld-dev", datetime_geq: ${JSON.stringify(sinceIso)}, datetime_leq: ${JSON.stringify(untilIso)}}) { dimensions { scriptName status } sum { requests } } } } }`
}

// The archive records `since` but until #195 nothing derived a gap from it, so
// a run that skipped six days read as an ordinary overnight window and every
// rate in the report was compared across unequal windows. The routine targets
// a daily cadence, so a window past 36 hours covers at least one skipped slot:
// the ordinary ~24h window plus jitter stays fresh, one missed day does not.
const STALE_BASELINE_HOURS = 36

export function deriveBaselineFlag(sinceIso, nowIso) {
  const since = Date.parse(sinceIso)
  const until = Date.parse(nowIso)
  // state.json is hand-editable, so an unparseable timestamp or a baseline in
  // the future is a real condition. The archive says so instead of reporting a
  // confident NaN or negative gap.
  if (Number.isNaN(since) || Number.isNaN(until) || until < since)
    return { _tag: 'invalid' }
  const gapHours = Math.round(((until - since) / 3_600_000) * 10) / 10
  return gapHours > STALE_BASELINE_HOURS
    ? { _tag: 'stale', gapHours }
    : { _tag: 'fresh', gapHours }
}

// A `skipped` conclusion is a guard declining to run, not a verdict. The deploy
// workflow is triggered by `workflow_run` from every branch and skips itself off
// `main`, so treating `skipped` as a non-success read a working guard as a
// broken gate on 2026-08-16. Skipped runs carry no signal, so they are read
// through rather than counted either way.
//
// A `cancelled` conclusion is the same shape: a run cancelled by its
// concurrency group never started, so it carries no verdict. On 2026-09-21 two
// cancelled queue-mates in front of the deploy that shipped a1b4db6 read as
// consecutive failures and the gate archived failure/2 on a healthy deploy.
// Cancelled runs are read through like skipped.
function carriesVerdict(run) {
  return run.status === 'completed' && run.conclusion !== 'skipped' && run.conclusion !== 'cancelled'
}

function completedState(runs) {
  const completed = runs.filter(carriesVerdict)
  const latest = completed[0] ?? null
  if (!latest)
    return { _tag: 'missing' }
  if (latest.conclusion === 'success')
    return { _tag: 'success' }

  let consecutiveFailures = 0
  for (const run of completed) {
    if (run.conclusion === 'success')
      break
    consecutiveFailures++
  }
  return { _tag: 'failure', consecutiveFailures }
}

// How many runs the collector asks GitHub for per workflow, and how many it asks
// for again when that first page reached no verdict.
//
// GitHub cannot answer "the last run that was not skipped". Both `gh run list
// --status` and the REST `?status=` filter take one value, and a verdict can be
// `success`, `failure`, `cancelled`, `timed_out`, `neutral`, `action_required`
// or `stale`, so an exclusion needs a client-side read of ordered history.
//
// 10 covers the ordinary case in one request. It does not cover a guard that
// skips on every branch push: on 2026-09-01 eleven consecutive skipped deploy
// runs sat in front of the deploy that shipped, so the ten-run page carried no
// verdict and a healthy deploy was archived as `missing`.
//
// 100 is one GitHub page, the largest history a single request can return. A
// workflow with no verdict in its last 100 runs has genuinely not reported one,
// so `missing` there is a real observability gap rather than a short sample.
const WORKFLOW_HEAD_SAMPLE = 10
const WORKFLOW_VERDICT_SAMPLE = 100

const workflowRunFields = 'databaseId,workflowName,displayTitle,headSha,status,conclusion,createdAt,updatedAt,url'

/**
 * The `gh run list` arguments every CI read must use. Scoped to `main` because
 * test.yml also runs on pull_request: an unscoped list let four PR branch
 * failures archive a broken main gate on 2026-09-10 while main's own Test run
 * on the deployed SHA passed. `workflow` is null for the recent feed.
 */
export function runListArgs(workflow, limit) {
  return [
    'run',
    'list',
    ...(workflow ? ['--workflow', workflow] : []),
    '--branch',
    'main',
    '--limit',
    String(limit),
    '--json',
    workflowRunFields,
  ]
}

/**
 * Fetch enough runs per workflow that `summarizeWorkflowRuns` can reach the last
 * verdict. `listRuns(name, limit)` returns that workflow's runs, newest first,
 * and may be synchronous or return a promise.
 *
 * The deeper page is only paid for when the head page reached no verdict and was
 * full. A short head page is the workflow's whole history, so a second request
 * would return the same rows.
 */
export async function collectWorkflowRuns(listRuns, workflowNames) {
  const rows = []
  for (const name of workflowNames) {
    const head = await listRuns(name, WORKFLOW_HEAD_SAMPLE)
    if (head.some(carriesVerdict) || head.length < WORKFLOW_HEAD_SAMPLE) {
      rows.push(...head)
      continue
    }
    rows.push(...await listRuns(name, WORKFLOW_VERDICT_SAMPLE))
  }
  return rows
}

// The gate must cover every workflow the repository defines, not a hand-kept
// list. A hardcoded list silently drops any workflow added later, which is how
// a failing scheduled alarm can sit outside the health verdict for a full day.
export function parseWorkflowName(source) {
  const declared = source.match(/^name:([^\n]*)$/m)?.[1]?.trim()
  if (!declared)
    return null
  const unquoted = declared.replace(/^(['"])(.*)\1$/, '$2').trim()
  return unquoted || null
}

// GitHub's per-workflow `gh run list` intermittently serves a day-stale
// snapshot: the 2026-09-30 archive read the Deploy gate success while the live
// gate had failed at 16:55Z (run 36747725607), and re-running the same command
// reproduced rows from three different days. The unscoped recent feed answers
// from separate evidence, so a run it shows for the workflow that is newer than
// the page's newest run proves the page is stale. Those rows join the page, and
// the verdict is computed from the union, so a stale page can only ever hide a
// verdict the feed re-reveals, never replace one.
export function corroborateWorkflowRuns(pageRows, corroboratingRows) {
  if (!corroboratingRows.length)
    return pageRows
  const known = new Set(pageRows.map(run => run.databaseId))
  const newestPageId = pageRows.reduce((max, run) => Math.max(max, run.databaseId), Number.NEGATIVE_INFINITY)
  const missing = corroboratingRows.filter(run => run.databaseId > newestPageId && !known.has(run.databaseId))
  if (!missing.length)
    return pageRows
  return [...missing, ...pageRows].sort((a, b) => b.databaseId - a.databaseId)
}

export function summarizeWorkflowRuns(rows, requiredWorkflowNames, corroboratingRows = []) {
  return requiredWorkflowNames.map((name) => {
    const runs = corroborateWorkflowRuns(
      rows.filter(row => row.workflowName === name),
      corroboratingRows.filter(row => row.workflowName === name),
    )
    const latestRun = runs[0] ?? null
    const latestCompletedRun = runs.find(carriesVerdict) ?? null
    const previousState = completedState(runs)

    if (!latestRun) {
      return {
        name,
        latestRun,
        latestCompletedRun,
        state: { _tag: 'missing' },
      }
    }
    if (latestRun.status !== 'completed') {
      return {
        name,
        latestRun,
        latestCompletedRun,
        state: {
          _tag: 'pending',
          consecutiveFailures: previousState._tag === 'failure' ? previousState.consecutiveFailures : 0,
          previousConclusion: latestCompletedRun?.conclusion || null,
        },
      }
    }
    return {
      name,
      latestRun,
      latestCompletedRun,
      state: previousState,
    }
  })
}

// ── Anonymous copy analytics ────────────────────────────────────────────────
//
// Command copies live in Cloudflare Analytics Engine, not D1, so the daily
// report reads them over the SQL API. Blob order is fixed by
// `shared/analytics.ts`: surface, mode, kind, slug, country.

export const ANALYTICS_ACCOUNT_TAG = '5904138d55ca25d5670dca6adf99894e'
export const COPY_DATASET = 'skilld_web_v1'

/** Analytics Engine reads `YYYY-MM-DD HH:MM:SS`, never an ISO string with `T`. */
export function analyticsTimestamp(iso) {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed))
    throw new Error(`Analytics window boundary is not a date: ${iso}`)
  return new Date(parsed).toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * Copies in the window, grouped by grammar, kind, and Skill, ranked and capped
 * at 50 rows. This page only ever feeds the ranked top list.
 *
 * `_sample_interval` restores the true count when Analytics Engine samples,
 * so a busy day does not read as a quiet one.
 */
export function buildCopyQuery(sinceIso, nowIso) {
  return `SELECT blob2 AS mode, blob3 AS kind, blob4 AS slug, sum(_sample_interval * double1) AS copies FROM ${COPY_DATASET} WHERE double1 > 0 AND timestamp >= toDateTime('${analyticsTimestamp(sinceIso)}') AND timestamp < toDateTime('${analyticsTimestamp(nowIso)}') GROUP BY mode, kind, slug ORDER BY copies DESC LIMIT 50`
}

/**
 * Copies in the window rolled up by grammar, with no row cap. Totals read
 * this query, so a day with more Skill groups than the ranked page can hold
 * still reports its full count.
 */
export function buildCopyTotalsQuery(sinceIso, nowIso) {
  return `SELECT blob2 AS mode, sum(_sample_interval * double1) AS copies FROM ${COPY_DATASET} WHERE double1 > 0 AND timestamp >= toDateTime('${analyticsTimestamp(sinceIso)}') AND timestamp < toDateTime('${analyticsTimestamp(nowIso)}') GROUP BY mode`
}

/**
 * Totals plus the most copied Skills.
 *
 * Totals sum the untruncated rollup; the ranked list reads the capped page,
 * so its rows never decide the reported totals. Run and install are reported
 * apart because they are different intents: a run copy reads a Skill once, an
 * install copy keeps it in every session.
 */
export function summarizeCopies(totalsRows, topRows) {
  const totals = { total: 0, run: 0, install: 0 }
  for (const row of totalsRows) {
    const copies = Number(row.copies) || 0
    totals.total += copies
    if (row.mode === 'run' || row.mode === 'install')
      totals[row.mode] += copies
  }
  return {
    ...totals,
    top: [...topRows]
      .sort((a, b) => (Number(b.copies) || 0) - (Number(a.copies) || 0))
      .slice(0, 10)
      .map(row => ({ slug: row.slug, kind: row.kind, mode: row.mode, copies: Number(row.copies) || 0 })),
  }
}
