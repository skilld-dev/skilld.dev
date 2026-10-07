import { expect, it } from 'vitest'
import { summarizeWorkflowRuns } from '../../checks/_helpers/observability.mjs'
import { evaluateCI, evaluateD1 } from '../../checks/_helpers/policy.mjs'

const now = new Date('2026-09-14T00:00:00Z')
const since = new Date(now.getTime() - 86_400_000)
function healthy() {
  return { missingExpectedTables: [], migrations: { localHead: '001.sql', prodHead: '001.sql' }, inventory: { broken_repos: 999 }, cost: { x_budget_target: 400, x_projected_monthly_usd: 40, x_budget_used_pct: 100, x_falling_behind: true }, activity: { digests_failed: 0 }, pipeline: {}, syncJobs: [], healthEmail: [{ deliveryStatus: 'sent' }] }
}
it('keeps accepted X spend and cumulative broken inventory healthy', () => {
  expect(evaluateD1(healthy(), now, since)._tag).toBe('Pass')
})
it.each([[40.01, 'Warn'], [60, 'Warn'], [60.01, 'Fail']])('gates projected monthly X spend at %s', (spend, tag) => {
  const data = healthy()
  data.cost.x_projected_monthly_usd = Number(spend)
  expect(evaluateD1(data, now, since)._tag).toBe(tag)
})
it('keeps missing schema evidence incomplete', () => {
  expect(evaluateD1({ ...healthy(), missingExpectedTables: ['jobs'] }, now, since)).toMatchObject({ _tag: 'Warn', coverage: 'incomplete', evidence: { missingExpectedTables: ['jobs'] } })
})
it('keeps a pending workflow visible after a failure', () => {
  expect(evaluateCI({ workflows: [{ state: { _tag: 'pending', consecutiveFailures: 1 } }] })._tag).toBe('Warn')
})

it('preserves a failed workflow when another workflow has no evidence', () => {
  const workflows = summarizeWorkflowRuns([
    { workflowName: 'Test', status: 'completed', conclusion: 'failure' },
  ], ['Test', 'Deploy'])
  expect(evaluateCI({ workflows })).toMatchObject({ _tag: 'Fail', coverage: 'incomplete' })
})
it.each(['queued', 'in_progress'])('keeps a first %s workflow incomplete', (status) => {
  const workflows = summarizeWorkflowRuns([{ workflowName: 'Test', status, conclusion: '' }], ['Test'])
  expect(evaluateCI({ workflows })).toMatchObject({ _tag: 'Warn', coverage: 'incomplete' })
})
it('accepts a pending workflow with a previous successful verdict', () => {
  const workflows = summarizeWorkflowRuns([
    { workflowName: 'Test', status: 'queued', conclusion: '' },
    { workflowName: 'Test', status: 'completed', conclusion: 'success' },
  ], ['Test'])
  expect(evaluateCI({ workflows })).toMatchObject({ _tag: 'Pass' })
})
it('returns a complete-evidence workflow failure without a coverage flag', () => {
  const workflows = summarizeWorkflowRuns([
    { workflowName: 'Test', status: 'completed', conclusion: 'failure' },
  ], ['Test'])
  const result = evaluateCI({ workflows })
  expect(result._tag).toBe('Fail')
  expect(result).not.toHaveProperty('coverage')
})

it.each(['spend', 'delivery'])('returns a complete-evidence %s failure without a coverage flag', (failure) => {
  const data = healthy()
  if (failure === 'spend')
    data.cost.x_projected_monthly_usd = 80
  else
    data.activity.digests_failed = 1
  const result = evaluateD1(data, now, since)
  expect(result._tag).toBe('Fail')
  expect(result).not.toHaveProperty('coverage')
})

it.each(['tables', 'migrations', 'budget'])('preserves known failures with missing %s evidence', (missing) => {
  for (const failure of ['spend', 'delivery']) {
    const data = {
      ...healthy(),
      missingExpectedTables: missing === 'tables' ? ['jobs'] : [],
      migrations: { ...healthy().migrations, error: missing === 'migrations' ? 'Unavailable' : null },
      cost: { ...healthy().cost, x_budget_target: missing === 'budget' ? null : 400, x_projected_monthly_usd: failure === 'spend' ? 80 : 40 },
      activity: { digests_failed: failure === 'delivery' ? 1 : 0 },
    }
    expect(evaluateD1(data, now, since)).toMatchObject({ _tag: 'Fail', coverage: 'incomplete' })
  }
})
