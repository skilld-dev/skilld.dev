/**
 * Waits for the matching `Deploy to Cloudflare` workflow run on main to succeed
 * before the Harness Worker rolls out, because the Worker can call site routes
 * introduced in the same merge.
 */

export type SiteDeployWaitFetch = (input: string, init: RequestInit) => Promise<Response>

export interface WorkflowRunSummary {
  readonly id: number
  readonly status: string
  readonly conclusion: string | null
  readonly created_at: string
}

export type SiteDeployWaitResult
  = | { readonly _tag: 'succeeded', readonly runId: number, readonly supersededByRunId?: number }
    | { readonly _tag: 'not-triggered' }
    | { readonly _tag: 'failed', readonly runId: number, readonly conclusion: string | null }
    | { readonly _tag: 'timed-out', readonly lastStatus: string | null }

export interface SiteDeployWaitOptions {
  repository: string
  sha: string
  token: string
  workflowFile?: string
  branch?: string
  fetch?: SiteDeployWaitFetch
  wait?: (milliseconds: number) => Promise<void>
  now?: () => number
  pollIntervalMs?: number
  appearanceGraceMs?: number
  timeoutMs?: number
}

function parseWorkflowRuns(payload: unknown): WorkflowRunSummary[] {
  if (typeof payload !== 'object' || payload === null || !('workflow_runs' in payload))
    throw new Error('Expected workflow_runs array in GitHub Actions API response.')
  const raw = (payload as { workflow_runs: unknown }).workflow_runs
  if (!Array.isArray(raw))
    throw new Error('Expected workflow_runs to be an array.')
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      if (typeof item.id !== 'number' || typeof item.status !== 'string' || typeof item.created_at !== 'string')
        throw new Error('Malformed workflow run entry in GitHub Actions API response.')
      const conclusion = item.conclusion === null || typeof item.conclusion === 'string' ? item.conclusion : null
      return { id: item.id, status: item.status, conclusion, created_at: item.created_at }
    })
}

async function listWorkflowRuns(
  fetch: SiteDeployWaitFetch,
  url: string,
  token: string,
): Promise<WorkflowRunSummary[]> {
  const response = await fetch(url, {
    headers: {
      'accept': 'application/vnd.github+json',
      'authorization': `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub Actions API returned ${response.status}: ${body.slice(0, 200)}`)
  }
  return parseWorkflowRuns(await response.json())
}

function findSupersedingRuns(runs: ReadonlyArray<WorkflowRunSummary>, cancelledRun: WorkflowRunSummary): WorkflowRunSummary[] {
  const cancelledAt = Date.parse(cancelledRun.created_at)
  return runs.filter(candidate => candidate.id !== cancelledRun.id && Date.parse(candidate.created_at) >= cancelledAt)
}

export async function waitForSiteDeploy(options: SiteDeployWaitOptions): Promise<SiteDeployWaitResult> {
  const fetch = options.fetch ?? globalThis.fetch
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const now = options.now ?? (() => Date.now())
  const workflowFile = options.workflowFile ?? 'deploy-cloudflare.yml'
  const branch = options.branch ?? 'main'
  const pollIntervalMs = options.pollIntervalMs ?? 10_000
  const appearanceGraceMs = options.appearanceGraceMs ?? 30_000
  const timeoutMs = options.timeoutMs ?? 15 * 60_000

  const baseUrl = `https://api.github.com/repos/${options.repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs`
  const shaUrl = `${baseUrl}?head_sha=${encodeURIComponent(options.sha)}&event=push&per_page=5`
  const branchUrl = `${baseUrl}?branch=${encodeURIComponent(branch)}&event=push&per_page=10`

  const startedAt = now()
  let lastStatus: string | null = null

  while (true) {
    const runs = await listWorkflowRuns(fetch, shaUrl, options.token)
    const run = runs[0]
    const elapsed = now() - startedAt

    if (!run) {
      if (elapsed >= appearanceGraceMs)
        return { _tag: 'not-triggered' }
      await wait(pollIntervalMs)
      continue
    }

    lastStatus = run.status
    if (run.status !== 'completed') {
      if (elapsed >= timeoutMs)
        return { _tag: 'timed-out', lastStatus }
      await wait(pollIntervalMs)
      continue
    }

    if (run.conclusion === 'success')
      return { _tag: 'succeeded', runId: run.id }

    if (run.conclusion === 'cancelled') {
      // A queued site deploy is cancelled when a newer main push replaces it in
      // the deploy concurrency group. That newer push carries our routes too.
      const branchRuns = await listWorkflowRuns(fetch, branchUrl, options.token)
      const superseding = findSupersedingRuns(branchRuns, run)
      const succeeded = superseding.find(candidate => candidate.status === 'completed' && candidate.conclusion === 'success')
      if (succeeded)
        return { _tag: 'succeeded', runId: run.id, supersededByRunId: succeeded.id }
      const pending = superseding.find(candidate => candidate.status !== 'completed')
      if (pending) {
        lastStatus = pending.status
        if (elapsed >= timeoutMs)
          return { _tag: 'timed-out', lastStatus }
        await wait(pollIntervalMs)
        continue
      }
      const latest = superseding[0]
      return latest
        ? { _tag: 'failed', runId: latest.id, conclusion: latest.conclusion }
        : { _tag: 'failed', runId: run.id, conclusion: run.conclusion }
    }

    return { _tag: 'failed', runId: run.id, conclusion: run.conclusion }
  }
}
