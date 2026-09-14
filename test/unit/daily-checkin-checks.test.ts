// @vitest-environment node
import { defineCheck, pass, runChecks, runExternalChecks } from '@harlan-zw/nuxt-checkin/external'
import { describe, expect, it, vi } from 'vitest'
import healthEmailCheck from '../../checks/external/health-email'
import sentryCheck from '../../checks/external/sentry'

const evidence = vi.hoisted(() => ({ deployment: undefined as string | undefined, healthReport: undefined as unknown }))
vi.mock('../../checks/_helpers/collectors.mjs', () => ({
  collectDeploy: async () => ({ latest: { versionId: evidence.deployment } }),
  collectD1: async () => ({ healthEmail: [{ checkin: evidence.healthReport }] }),
}))

async function runDailyOperatorChecks({ now, token, deployment, healthReport, environment, clock, request }: any) {
  evidence.deployment = deployment
  evidence.healthReport = healthReport
  vi.stubGlobal('fetch', request)
  const { report } = await runExternalChecks([sentryCheck, healthEmailCheck], { required: ['sentry.skilld', 'skilld.health-email'], credentials: { sentry: 'SENTRY_AUTH_TOKEN' } }, { now, clock, env: { SENTRY_AUTH_TOKEN: token, SENTRY_ENVIRONMENT: environment } })
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
  it('combines the saved health report with the complete Sentry backlog', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: '123', project: { slug: 'skilld' } }]), { status: 200 }))
    const report = await runDailyOperatorChecks({ clock: () => now, now, token: 'read-token', deployment: identity.deployment, healthReport: await healthReport(), environment: 'production', request })
    expect(report).toMatchObject({ severity: 'warn', coverage: 'complete' })
    expect(report.results[0]?.result).toMatchObject({ _tag: 'Warn', evidence: { issueIds: ['123'] } })
    const url = new URL(request.mock.calls[0]![0])
    expect(url.searchParams.get('environment')).toBe('production')
    expect(url.searchParams.get('start')).toBe('1970-01-01T00:00:00.000Z')
  })

  it('reports missing credentials and a stale report as incomplete', async () => {
    const request = vi.fn()
    const report = await runDailyOperatorChecks({ clock: () => new Date(now.getTime() + 48 * 60 * 60 * 1000), now: new Date(now.getTime() + 48 * 60 * 60 * 1000), deployment: identity.deployment, healthReport: await healthReport(), request })
    expect(report.coverage).toBe('incomplete')
    expect(report.results.map(check => check.result._tag)).toEqual(['Unavailable', 'Unavailable'])
    expect(request).not.toHaveBeenCalled()
  })

  it('accepts a report collected after the external run started', async () => {
    const observedAt = new Date(now.getTime() + 5000)
    const report = await runDailyOperatorChecks({ now, clock: () => new Date(observedAt.getTime() + 1000), deployment: identity.deployment, healthReport: await healthReport(observedAt), request: vi.fn() })
    expect(report.results[1]?.result._tag).toBe('Pass')
  })

  it('rejects a health report from a previous deployment', async () => {
    const report = await runDailyOperatorChecks({ clock: () => now, now, deployment: 'worker-new', healthReport: await healthReport(), request: vi.fn() })
    expect(report.results[1]?.result).toMatchObject({ _tag: 'Unavailable', reason: 'Check report identity does not match.' })
  })
})
