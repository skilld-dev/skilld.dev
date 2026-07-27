import { describe, expect, it } from 'vitest'
import {
  parseRegistryConvergence,
  REGISTRY_CONVERGENCE_SQL,
  registryConvergenceSummary,
} from '../../scripts/lib/registry-convergence'

function result(results: Record<string, number>[]) {
  return {
    success: true,
    results,
    meta: {},
  }
}

describe('registry convergence audit', () => {
  it('keeps fixed mechanisms separate from unfinished production convergence', () => {
    const parsed = parseRegistryConvergence(JSON.stringify([
      result([{ total_repos: 274, source_identified: 1 }]),
      result([{ historical_staged: 249 }]),
      result([{ historical_unstaged: 5046 }]),
      result([{ eligible: 2771, classifier_v3: 844 }]),
    ]))

    expect(parsed).toEqual({
      _tag: 'ok',
      snapshot: {
        sourceIdentity: { total: 274, current: 1, remaining: 273 },
        historicalDiscovery: { total: 5295, current: 249, remaining: 5046 },
        abstractnessV3: { total: 2771, current: 844, remaining: 1927 },
      },
    })
  })

  it('measures source identity only for active repositories used by skill fetches', () => {
    expect(REGISTRY_CONVERGENCE_SQL).toContain(
      `FROM repos r
  WHERE r.broken_since IS NULL
    AND EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
    );`,
    )
  })

  it('returns malformed remote output as an explicit error', () => {
    expect(parseRegistryConvergence('{}')).toEqual({
      _tag: 'error',
      reason: 'malformed_d1_output',
    })
  })

  it('summarizes progress without treating an incomplete backlog as failure', () => {
    expect(registryConvergenceSummary({
      sourceIdentity: { total: 10, current: 4, remaining: 6 },
      historicalDiscovery: { total: 20, current: 5, remaining: 15 },
      abstractnessV3: { total: 8, current: 8, remaining: 0 },
    })).toEqual({
      _tag: 'converging',
      complete: ['abstractnessV3'],
      incomplete: ['sourceIdentity', 'historicalDiscovery'],
    })
  })
})
