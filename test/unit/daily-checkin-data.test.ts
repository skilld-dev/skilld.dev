// @vitest-environment node
import { runExternalChecks } from '@harlan-zw/nuxt-checkin/external'
import { expect, it } from 'vitest'
import baselineCheck from '../../checks/external/baseline'

const now = new Date('2026-09-14T00:00:00Z')
it('records a stale window without blocking a successful replacement baseline', async () => {
  const { report } = await runExternalChecks([baselineCheck], { required: [baselineCheck.id] }, { now, since: new Date(now.getTime() - 48 * 3_600_000), env: {} })
  expect(report).toMatchObject({ severity: 'pass', coverage: 'complete', results: [{ result: { evidence: { _tag: 'stale', gapHours: 48 } } }] })
})
it('marks an invalid comparison window as missing evidence', async () => {
  const { report } = await runExternalChecks([baselineCheck], { required: [baselineCheck.id] }, { now, since: new Date('invalid'), env: {} })
  expect(report.coverage).toBe('incomplete')
  expect(report.results[0]?.result).toMatchObject({ _tag: 'Warn', coverage: 'incomplete', evidence: { _tag: 'invalid' } })
})
