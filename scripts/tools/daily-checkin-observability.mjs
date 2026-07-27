function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function completedState(runs) {
  const completed = runs.filter(run => run.status === 'completed')
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

export function summarizeWorkflowRuns(rows, requiredWorkflowNames) {
  return requiredWorkflowNames.map((name) => {
    const runs = rows.filter(row => row.workflowName === name)
    const latestRun = runs[0] ?? null
    const latestCompletedRun = runs.find(run => run.status === 'completed') ?? null
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
