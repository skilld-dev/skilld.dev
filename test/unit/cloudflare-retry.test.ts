import type { ProductionCommandResult } from '../../scripts/lib/production-deploy'
import { describe, expect, it, vi } from 'vitest'
import { isTransientCloudflareFailure, withTransientRetry } from '../../scripts/lib/cloudflare-retry'

// The Deploy Artifact signer step on 2026-10-07, run 37562888913 attempt 1.
const UNKNOWN_ERROR = [
  '✘ [ERROR] A request to the Cloudflare API (/accounts/abc/workers/scripts/skilld-artifact-signer/deployments) failed.',
  '  An unknown error has occurred. If this error persists, please file a report in workers-sdk (https://github.com/cloudflare/workers-sdk/issues) or reach out to your account team. [code: 10013]',
].join('\n')
const AUTH_ERROR = '✘ [ERROR] A request to the Cloudflare API (/accounts/abc/workers/scripts/x) failed.\n  Authentication error [code: 10000]'

function failed(stderr: string): ProductionCommandResult {
  return { _tag: 'failed', stdout: '', stderr, exitCode: 1 }
}

const passed: ProductionCommandResult = { _tag: 'passed', stdout: 'Deployed', stderr: '' }

describe('isTransientCloudflareFailure', () => {
  it('treats the Cloudflare API unknown error as transient', () => {
    expect(isTransientCloudflareFailure(UNKNOWN_ERROR)).toBe(true)
  })

  it('treats a gateway error from the Cloudflare API as transient', () => {
    expect(isTransientCloudflareFailure('A request to the Cloudflare API (/accounts/abc/workers/scripts/x) failed.\n  503 Service Unavailable')).toBe(true)
  })

  it('never retries an authentication or configuration error', () => {
    expect(isTransientCloudflareFailure(AUTH_ERROR)).toBe(false)
    expect(isTransientCloudflareFailure('✘ [ERROR] Missing entry-point to Worker script or to assets directory')).toBe(false)
  })
})

describe('withTransientRetry', () => {
  it('retries a transient failure and returns the passing result', async () => {
    const command = vi.fn()
      .mockResolvedValueOnce(failed(UNKNOWN_ERROR))
      .mockResolvedValueOnce(passed)
    const wait = vi.fn().mockResolvedValue(undefined)
    const retrying = withTransientRetry(command, { wait, log: () => {} })

    await expect(retrying(['deploy'])).resolves.toEqual(passed)
    expect(command).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledOnce()
  })

  it('returns a non-transient failure without a retry', async () => {
    const command = vi.fn().mockResolvedValue(failed(AUTH_ERROR))
    const wait = vi.fn().mockResolvedValue(undefined)
    const retrying = withTransientRetry(command, { wait, log: () => {} })

    await expect(retrying(['deploy'])).resolves.toEqual(failed(AUTH_ERROR))
    expect(command).toHaveBeenCalledOnce()
    expect(wait).not.toHaveBeenCalled()
  })

  it('stops after the last delay and returns the last failure', async () => {
    const command = vi.fn().mockResolvedValue(failed(UNKNOWN_ERROR))
    const wait = vi.fn().mockResolvedValue(undefined)
    const retrying = withTransientRetry(command, { wait, log: () => {}, delaysMs: [10, 20] })

    await expect(retrying(['deploy'])).resolves.toEqual(failed(UNKNOWN_ERROR))
    expect(command).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls).toEqual([[10], [20]])
  })
})
