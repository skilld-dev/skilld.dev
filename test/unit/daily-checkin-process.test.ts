// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ghEnv, runReadOnlyProcess, subprocessEnv } from '../../scripts/tools/daily-checkin-process.mjs'

describe('daily check-in process runner', () => {
  it('retries one transient signal termination', () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, signal: null, stdout: '[]\n', stderr: '' })

    expect(runReadOnlyProcess(spawn, 'wrangler', ['deployments', 'list'])).toBe('[]')
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('reports the terminating signal when the retry also fails', () => {
    const spawn = vi.fn()
      .mockReturnValue({ status: null, signal: 'SIGKILL', stdout: '', stderr: '' })

    expect(() => runReadOnlyProcess(spawn, 'wrangler', ['deployments', 'list']))
      .toThrow('wrangler terminated by SIGKILL')
  })
})

describe('daily check-in gh environment', () => {
  it('validates the environment token with gh and keeps it when gh accepts it', () => {
    const spawn = vi.fn()
      .mockReturnValue({ status: 0, stdout: '{"login":"harlan-zw"}', stderr: '' })
    const env = { GITHUB_TOKEN: 'gho_valid', HOME: '/home/harlan' }

    expect(ghEnv(env, spawn)).toEqual({ GITHUB_TOKEN: 'gho_valid', HOME: '/home/harlan' })
    expect(spawn).toHaveBeenCalledWith(
      'gh',
      ['api', 'user'],
      expect.objectContaining({ env: expect.objectContaining({ GITHUB_TOKEN: 'gho_valid' }) }),
    )
  })

  it('strips stale tokens so gh falls back to its keyring login', () => {
    const spawn = vi.fn()
      .mockReturnValue({ status: 1, stdout: '', stderr: 'gh: HTTP 401: Bad credentials (https://api.github.com/user)' })
    const env = { GITHUB_TOKEN: 'gho_stale', GH_TOKEN: 'ghp_stale', HOME: '/home/harlan' }

    expect(ghEnv(env, spawn)).toEqual({ HOME: '/home/harlan' })
  })

  it('leaves the environment untouched when no github token is set', () => {
    const spawn = vi.fn()
    const env = { HOME: '/home/harlan' }

    expect(ghEnv(env, spawn)).toEqual({ HOME: '/home/harlan' })
    expect(spawn).not.toHaveBeenCalled()
  })
})

describe('daily check-in subprocess environment', () => {
  const staleEnv = { GITHUB_TOKEN: 'gho_stale', GH_TOKEN: 'ghp_stale', HOME: '/home/harlan' }
  const rejectToken = () => vi.fn()
    .mockReturnValue({ status: 1, stdout: '', stderr: 'gh: HTTP 401: Bad credentials (https://api.github.com/user)' })

  it('serves gh the sanitized environment', () => {
    const spawn = rejectToken()

    expect(subprocessEnv('gh', staleEnv, () => ghEnv(staleEnv, spawn))).toEqual({ HOME: '/home/harlan' })
  })

  it('serves git the sanitized environment so a stale token cannot reach the credential helper', () => {
    const spawn = rejectToken()

    expect(subprocessEnv('git', staleEnv, () => ghEnv(staleEnv, spawn))).toEqual({ HOME: '/home/harlan' })
  })

  it('leaves other commands on the inherited environment without paying for token resolution', () => {
    const spawn = rejectToken()

    expect(subprocessEnv('wrangler', staleEnv, () => ghEnv(staleEnv, spawn))).toEqual(staleEnv)
    expect(spawn).not.toHaveBeenCalled()
  })
})
