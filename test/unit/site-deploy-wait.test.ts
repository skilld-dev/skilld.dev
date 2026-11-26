import type { SiteDeployWaitFetch, WorkflowRunSummary } from '../../scripts/lib/site-deploy-wait'
import { describe, expect, it } from 'vitest'
import { waitForSiteDeploy } from '../../scripts/lib/site-deploy-wait'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function makeClock(stepMs = 10_000): { now: () => number, wait: (ms: number) => Promise<void> } {
  let time = 0
  return {
    now: () => time,
    wait: async (ms: number) => {
      time += ms || stepMs
    },
  }
}

describe('waitForSiteDeploy', () => {
  it('polls until the matching site deploy run succeeds', async () => {
    const responses: WorkflowRunSummary[][] = [
      [{ id: 101, status: 'in_progress', conclusion: null, created_at: '2026-11-26T20:40:00Z' }],
      [{ id: 101, status: 'completed', conclusion: 'success', created_at: '2026-11-26T20:40:00Z' }],
    ]
    let calls = 0
    const fetch: SiteDeployWaitFetch = async () => jsonResponse({ workflow_runs: responses[calls++] ?? [] })
    const clock = makeClock()

    const result = await waitForSiteDeploy({
      repository: 'skilld-dev/skilld.dev',
      sha: 'abc1234',
      token: 'tok',
      fetch,
      ...clock,
    })

    expect(result).toEqual({ _tag: 'succeeded', runId: 101 })
    expect(calls).toBe(2)
  })

  it('returns not-triggered when no deploy run appears within the grace window', async () => {
    const fetch: SiteDeployWaitFetch = async () => jsonResponse({ workflow_runs: [] })
    const clock = makeClock()

    const result = await waitForSiteDeploy({
      repository: 'skilld-dev/skilld.dev',
      sha: 'abc1234',
      token: 'tok',
      fetch,
      ...clock,
      appearanceGraceMs: 20_000,
      pollIntervalMs: 10_000,
    })

    expect(result).toEqual({ _tag: 'not-triggered' })
  })

  it('fails when the matching site deploy run fails', async () => {
    const fetch: SiteDeployWaitFetch = async () => jsonResponse({
      workflow_runs: [{ id: 102, status: 'completed', conclusion: 'failure', created_at: '2026-11-26T20:40:00Z' }],
    })
    const clock = makeClock()

    const result = await waitForSiteDeploy({
      repository: 'skilld-dev/skilld.dev',
      sha: 'abc1234',
      token: 'tok',
      fetch,
      ...clock,
    })

    expect(result).toEqual({ _tag: 'failed', runId: 102, conclusion: 'failure' })
  })

  it('succeeds when a cancelled queued site deploy is superseded by a newer successful main deploy', async () => {
    const cancelled: WorkflowRunSummary = { id: 103, status: 'completed', conclusion: 'cancelled', created_at: '2026-11-26T20:40:00Z' }
    const newerInProgress: WorkflowRunSummary = { id: 104, status: 'in_progress', conclusion: null, created_at: '2026-11-26T20:40:15Z' }
    const newerSucceeded: WorkflowRunSummary = { id: 104, status: 'completed', conclusion: 'success', created_at: '2026-11-26T20:40:15Z' }
    let branchCalls = 0
    const fetch: SiteDeployWaitFetch = async (url) => {
      if (url.includes('head_sha='))
        return jsonResponse({ workflow_runs: [cancelled] })
      return jsonResponse({ workflow_runs: [branchCalls++ === 0 ? newerInProgress : newerSucceeded, cancelled] })
    }
    const clock = makeClock()

    const result = await waitForSiteDeploy({
      repository: 'skilld-dev/skilld.dev',
      sha: 'abc1234',
      token: 'tok',
      fetch,
      ...clock,
    })

    expect(result).toEqual({ _tag: 'succeeded', runId: 103, supersededByRunId: 104 })
  })

  it('fails when a cancelled site deploy has no newer main run superseding it', async () => {
    const cancelled: WorkflowRunSummary = { id: 105, status: 'completed', conclusion: 'cancelled', created_at: '2026-11-26T20:40:00Z' }
    const fetch: SiteDeployWaitFetch = async () => jsonResponse({ workflow_runs: [cancelled] })
    const clock = makeClock()

    const result = await waitForSiteDeploy({
      repository: 'skilld-dev/skilld.dev',
      sha: 'abc1234',
      token: 'tok',
      fetch,
      ...clock,
    })

    expect(result).toEqual({ _tag: 'failed', runId: 105, conclusion: 'cancelled' })
  })

  it('returns timed-out when the site deploy does not finish in time', async () => {
    const fetch: SiteDeployWaitFetch = async () => jsonResponse({
      workflow_runs: [{ id: 106, status: 'in_progress', conclusion: null, created_at: '2026-11-26T20:40:00Z' }],
    })
    const clock = makeClock()

    const result = await waitForSiteDeploy({
      repository: 'skilld-dev/skilld.dev',
      sha: 'abc1234',
      token: 'tok',
      fetch,
      ...clock,
      pollIntervalMs: 10_000,
      timeoutMs: 20_000,
    })

    expect(result).toEqual({ _tag: 'timed-out', lastStatus: 'in_progress' })
  })
})
