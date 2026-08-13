// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { resolveSkillAuditOverview } from '../../app/utils/skill-audit-overview'

describe('skill audit overview', () => {
  it('summarises passing checks with risk context', () => {
    const overview = resolveSkillAuditOverview(Array.from({ length: 5 }, (_, index) => ({
      provider: `provider-${index}`,
      slug: `check-${index}`,
      status: 'pass',
      auditedAt: index === 0 ? '2026-06-01T00:00:00.000Z' : undefined,
      riskLevel: 'safe',
    })))

    expect(overview).toMatchObject({
      tone: 'success',
      label: 'No alerts',
      detail: '5 checks · Risk SAFE',
      latestAuditedAt: '2026-06-01T00:00:00.000Z',
    })
  })

  it.each([
    ['warn', 'warning', '1 warning'],
    ['fail', 'error', '1 alert'],
    ['pending', 'warning', 'Review needed'],
  ] as const)('maps %s checks to a semantic %s signal', (status, tone, label) => {
    expect(resolveSkillAuditOverview([{
      provider: 'provider',
      slug: 'check',
      status,
    }])).toMatchObject({ tone, label, detail: '1 check' })
  })

  it('returns no claim without audit results', () => {
    expect(resolveSkillAuditOverview([])).toBeNull()
  })
})
