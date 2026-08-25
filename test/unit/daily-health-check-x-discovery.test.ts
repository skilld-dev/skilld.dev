// @vitest-environment node
import type { DailyHealthCheckSummary } from '../../layers/identity/server/utils/daily-health-check'
import { describe, expect, it } from 'vitest'
import { evaluateDailyHealthStatus } from '../../layers/identity/server/utils/daily-health-check'

/**
 * A summary with everything healthy, so each test varies one X figure and the
 * resulting reason is unambiguously about that figure.
 */
function healthy(
  xDiscovery: Partial<DailyHealthCheckSummary['xDiscovery']> = {},
): Omit<DailyHealthCheckSummary, 'status' | 'reasons'> {
  return {
    warnings: [],
    window: { reportDate: '2026-08-14', timeZone: 'UTC', from: '', to: '', workerVersion: null },
    frontDoor: { checks: [{ url: 'https://skilld.dev/', status: 200 }] },
    trendingSkills: { checks: [] },
    inventory: { skills: 100, repos: 10, owners: 5, users: 5, collections: 3, watchedRepos: 1, brokenRepos: 0 },
    activity: { newSkills24h: 1, repoChanges24h: 1, commandCopies24h: { run: 1, install: 0, unattributed: 0 }, newUsers24h: 0, digestsSent24h: 0, digestsFailed24h: 0 },
    pipeline: {
      syncJobs: [],
      scheduledRuns: [],
      newlyBrokenReposTotal24h: 0,
      newlyBrokenReposImpacted24h: 0,
      skillSyncFailures24h: 0,
      staleDirtySkills: 0,
      aiBatchesSubmitted: 0,
      aiBatchesStuck: 0,
      aiBatchesFailed24h: 0,
      failedJobs24h: 0,
      staleReservedJobs: 0,
      openFailedBatches: 0,
      discoveryCandidatesExhausted: 0,
      discoveryCandidatesOverdue: 0,
      discoveryClaimsStale: 0,
      leaderboardApprovalsStuck: 0,
      failedJobDetails: [],
    },
    cost: { estimatedAiUsd24h: 0, estimatedAiUsdMonth: 0 },
    xDiscovery: {
      budgetSpentToday: 40,
      budgetLimit: 400,
      readsMonth: 800,
      estimatedUsdMonth: 4,
      keepingUp: true,
      cursorLagHours: 2,
      postsStored24h: 30,
      reposDiscovered24h: 12,
      verifiedSkillsTotal: 11,
      verifiedSkills24h: 1,
      readsPerVerifiedSkill: 72,
      ledgerPending: 5,
      ledgerHeld: 3,
      ledgerStalled: 0,
      ...xDiscovery,
    },
    credentials: { githubToken: { _tag: 'unknown' } },
  } as Omit<DailyHealthCheckSummary, 'status' | 'reasons'>
}

function reasonsFor(x: Partial<DailyHealthCheckSummary['xDiscovery']>) {
  return evaluateDailyHealthStatus(healthy(x)).reasons.join(' ')
}

describe('daily health check, X discovery', () => {
  it('stays green when discovery is keeping up', () => {
    expect(evaluateDailyHealthStatus(healthy()).status).toBe('GREEN')
  })

  it('warns when the budget ran out before the window finished', () => {
    // The failure that shows up as nothing else: no task fails, no error is
    // logged, the feed just silently falls further behind every day.
    const reasons = reasonsFor({ keepingUp: false, budgetSpentToday: 400 })
    expect(reasons).toContain('did not finish the window')
    expect(reasons).toContain('DAILY_DISCOVERY_READ_BUDGET')
  })

  it('warns when the freshest post is more than a day old', () => {
    expect(reasonsFor({ cursorLagHours: 50 })).toContain('50 hours old')
  })

  it('stays quiet on a lag inside the normal window', () => {
    expect(reasonsFor({ cursorLagHours: 6 })).not.toContain('hours old')
  })

  it('warns when submissions have stalled without indexing finishing', () => {
    expect(reasonsFor({ ledgerStalled: 4 })).toContain('4 discovered repositories')
  })

  it('warns when a month of reads produced no verified skills', () => {
    // Spending with nothing to show means the query is wrong, not the budget.
    expect(reasonsFor({ readsMonth: 900, verifiedSkillsTotal: 0 }))
      .toContain('900 reads this month and verified no skills')
  })

  it('does not cry wolf before enough has been spent to judge', () => {
    expect(reasonsFor({ readsMonth: 100, verifiedSkillsTotal: 0 }))
      .not
      .toContain('verified no skills')
  })

  it('reports X problems as amber, never taking the site red', () => {
    const status = evaluateDailyHealthStatus(healthy({
      keepingUp: false,
      cursorLagHours: 90,
      ledgerStalled: 9,
    })).status
    expect(status).toBe('AMBER')
  })
})
