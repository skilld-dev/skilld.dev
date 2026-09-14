import { fail, pass, warn } from '@harlan-zw/nuxt-checkin/external'

/** @returns {import('@harlan-zw/nuxt-checkin/external').CheckResult} */
export function evaluateCI(data) {
  if (!data.workflows.length || data.workflows.some(workflow => workflow.state._tag === 'missing'))
    return { _tag: 'Warn', reason: 'Workflow evidence is missing.', evidence: data, coverage: 'incomplete' }
  if (data.workflows.some(workflow => workflow.state._tag === 'failure'))
    return fail('A workflow is failing.', data)
  if (data.workflows.some(workflow => workflow.state._tag === 'pending' && workflow.state.consecutiveFailures > 0))
    return warn('A workflow is pending after a failure.', data)
  return pass(data)
}

/** @returns {import('@harlan-zw/nuxt-checkin/external').CheckResult} */
export function evaluateD1(data, now, since) {
  if (data.missingExpectedTables.length)
    return { _tag: 'Warn', reason: 'Expected database tables are missing.', evidence: data, coverage: 'incomplete' }
  if (data.migrations.error)
    return { _tag: 'Warn', reason: 'Production migration evidence is unavailable.', evidence: data, coverage: 'incomplete' }
  if (data.cost.x_budget_target === null)
    return { _tag: 'Warn', reason: 'X discovery budget is unavailable.', evidence: data, coverage: 'incomplete' }
  if (data.cost.x_projected_monthly_usd > 60)
    return fail('Projected X spend exceeds $60 per month.', data)
  const failed = data.activity.digests_failed > 0
    || data.pipeline.stale_reserved_jobs > 0
    || data.syncJobs?.some(job => job.last_status === 'error' || (job.stale_after_seconds && Number(job.last_run_at) + Number(job.stale_after_seconds) < now.getTime() / 1000))
  if (failed)
    return fail('Delivery or scheduled work needs attention.', data)
  const warning = data.cost.x_over_budget || data.cost.x_projected_monthly_usd > 40
    || data.migrations.localHead !== data.migrations.prodHead
    || ['newly_broken_repos_impacted', 'skill_sync_failures', 'stale_dirty_skills', 'ai_stuck', 'ai_failed', 'embeddings_failed', 'embeddings_stuck', 'failed_jobs'].some(key => data.pipeline[key] > 0)
    || data.syncJobs?.some(job => job.last_status === 'partial' && job.last_run_at >= since.getTime() / 1000)
    || data.healthEmail?.[0]?.deliveryStatus !== 'sent'
  return warning ? warn('Database evidence needs attention.', data) : pass(data)
}
