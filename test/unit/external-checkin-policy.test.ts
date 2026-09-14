// @vitest-environment node
import { expect, it } from 'vitest'
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
  expect(evaluateD1({ ...healthy(), missingExpectedTables: ['jobs'] }, now, since)._tag).toBe('Unavailable')
})
it('keeps a pending workflow visible after a failure', () => {
  expect(evaluateCI({ workflows: [{ state: { _tag: 'pending', consecutiveFailures: 1 } }] })._tag).toBe('Warn')
})
