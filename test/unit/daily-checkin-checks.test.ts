// @vitest-environment node
import { defineCheck, pass, runChecks, runExternalChecks } from '@harlan-zw/nuxt-checkin/external'
import { describe, expect, it, vi } from 'vitest'
import healthEmailCheck from '../../checks/external/report'

const evidence = vi.hoisted(() => ({ deployment: undefined as string | undefined, healthReport: undefined as unknown }))
vi.mock('../../checks/_helpers/collectors.mjs', () => ({
  collectDeploy: async () => ({ latest: { versionId: evidence.deployment } }),
  collectD1: async () => ({ healthEmail: [{ checkin: evidence.healthReport }] }),
}))

async function runDailyOperatorChecks({ now, deployment, healthReport, clock }: any) {
  evidence.deployment = deployment
  evidence.healthReport = healthReport
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(healthReport)))
  const { report } = await runExternalChecks([healthEmailCheck], { required: ['skilld.report'] }, { now, clock, env: { NUXT_CHECKIN_TOKEN: 'report-token' } })
  return report
}

const now = new Date('2026-09-14T22:00:00Z')
const identity = { site: 'skilld.dev', environment: 'production', deployment: 'worker-123' }

async function healthReport(observedAt = now) {
  return runChecks([
    defineCheck({ id: 'skilld.daily-health', run: () => pass() }),
    defineCheck({ id: 'skilld.daily-health-coverage', run: () => pass() }),
  ], { now: observedAt, identity })
}

describe('external daily check-in', () => {
  it('reports a stale report as incomplete', async () => {
    const report = await runDailyOperatorChecks({ clock: () => new Date(now.getTime() + 48 * 60 * 60 * 1000), now: new Date(now.getTime() + 48 * 60 * 60 * 1000), deployment: identity.deployment, healthReport: await healthReport() })
    expect(report.coverage).toBe('incomplete')
    expect(report.results.map(check => check.result._tag)).toEqual(['Unavailable'])
  })

  it('accepts a report collected after the external run started', async () => {
    const observedAt = new Date(now.getTime() + 5000)
    const report = await runDailyOperatorChecks({ now, clock: () => new Date(observedAt.getTime() + 1000), deployment: identity.deployment, healthReport: await healthReport(observedAt) })
    expect(report.results[0]?.result._tag).toBe('Pass')
  })

  it('rejects a health report from a previous deployment', async () => {
    const report = await runDailyOperatorChecks({ clock: () => now, now, deployment: 'worker-new', healthReport: await healthReport() })
    expect(report.results[0]?.result).toMatchObject({ _tag: 'Unavailable', reason: 'Check report identity does not match.' })
  })
})
