function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

const PRODUCTION_REF = 'origin/main'
const isMigration = file => /^\d.*\.sql$/.test(file)

function migrationFiles(tree) {
  return tree
    .split('\n')
    .map(path => path.slice('migrations/'.length))
    .filter(isMigration)
    .sort()
}

export function approximateDeployedSha(runGit, deployedAt) {
  if (!deployedAt)
    return null
  return runGit(['rev-list', '-1', `--before=${deployedAt}`, PRODUCTION_REF]) || null
}

export function readMigrationState(runGit, workingTreeMigrations) {
  const productionMigrations = migrationFiles(
    runGit(['ls-tree', '--name-only', PRODUCTION_REF, 'migrations/']),
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

// A `skipped` conclusion is a guard declining to run, not a verdict. The deploy
// workflow is triggered by `workflow_run` from every branch and skips itself off
// `main`, so treating `skipped` as a non-success read a working guard as a
// broken gate on 2026-08-16. Skipped runs carry no signal, so they are read
// through rather than counted either way.
function carriesVerdict(run) {
  return run.status === 'completed' && run.conclusion !== 'skipped'
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

/**
 * Fetch enough runs per workflow that `summarizeWorkflowRuns` can reach the last
 * verdict. `listRuns(name, limit)` returns that workflow's runs, newest first.
 *
 * The deeper page is only paid for when the head page reached no verdict and was
 * full. A short head page is the workflow's whole history, so a second request
 * would return the same rows.
 */
export function collectWorkflowRuns(listRuns, workflowNames) {
  return workflowNames.flatMap((name) => {
    const head = listRuns(name, WORKFLOW_HEAD_SAMPLE)
    if (head.some(carriesVerdict) || head.length < WORKFLOW_HEAD_SAMPLE)
      return head
    return listRuns(name, WORKFLOW_VERDICT_SAMPLE)
  })
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

export function summarizeWorkflowRuns(rows, requiredWorkflowNames) {
  return requiredWorkflowNames.map((name) => {
    const runs = rows.filter(row => row.workflowName === name)
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

function stringArray(value, field) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string'))
    throw new Error(`daily health check ${field} must be a string array`)
  return value
}

export function parseHealthEmailRows(rows) {
  return rows.map((row) => {
    const summary = (() => {
      try {
        return record(JSON.parse(row.summary_json))
      }
      catch {
        throw new Error(`daily health check ${row.report_date} has invalid summary_json`)
      }
    })()
    if (!summary)
      throw new Error(`daily health check ${row.report_date} summary_json must contain an object`)
    const window = record(summary.window)
    if (!window)
      throw new Error(`daily health check ${row.report_date} summary_json is missing its window`)

    return {
      reportDate: row.report_date,
      healthStatus: row.health_status,
      deliveryStatus: row.delivery_status,
      recipient: row.recipient,
      sentAt: row.sent_at,
      error: row.error,
      reasons: stringArray(summary.reasons, 'reasons'),
      warnings: stringArray(summary.warnings, 'warnings'),
      window,
    }
  })
}
