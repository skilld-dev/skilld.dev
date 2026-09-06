import { describe, expect, it, vi } from 'vitest'
import { runReadOnlyProcess } from '../../scripts/tools/daily-checkin-process.mjs'

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

  it('retries an HTTP 401 Bad credentials failure with GitHub env tokens stripped', () => {
    const envs: Array<Record<string, string | undefined>> = []
    const spawn = vi.fn().mockImplementation((_command, _args, options) => {
      envs.push(options.env)
      if (envs.length === 1)
        return { status: 1, signal: null, stdout: '', stderr: 'gh: failed to get runs: HTTP 401: Bad credentials (https://api.github.com/graphql)' }
      return { status: 0, signal: null, stdout: '[{"databaseId":1}]\n', stderr: '' }
    })

    expect(runReadOnlyProcess(spawn, 'gh', ['run', 'list'], { env: { GITHUB_TOKEN: 'stale', GH_TOKEN: 'stale', HOME: '/home/harlan' } }))
      .toBe('[{"databaseId":1}]')
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(envs[1].GITHUB_TOKEN).toBeUndefined()
    expect(envs[1].GH_TOKEN).toBeUndefined()
    expect(envs[1].HOME).toBe('/home/harlan')
  })

  it('reports the stripped-env retry failure when it also exits nonzero', () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 1, signal: null, stdout: '', stderr: 'gh: HTTP 401: Bad credentials (https://api.github.com/graphql)' })
      .mockReturnValueOnce({ status: 1, signal: null, stdout: '', stderr: 'gh: To get started with GitHub CLI, please run: gh auth login' })

    expect(() => runReadOnlyProcess(spawn, 'gh', ['run', 'list'], { env: { GITHUB_TOKEN: 'stale' } }))
      .toThrow('gh auth login')
  })

  it('does not retry an ordinary nonzero exit', () => {
    const spawn = vi.fn()
      .mockReturnValue({ status: 1, signal: null, stdout: '', stderr: 'no runs found' })

    expect(() => runReadOnlyProcess(spawn, 'gh', ['run', 'list'], { env: { GITHUB_TOKEN: 'fine' } }))
      .toThrow('no runs found')
    expect(spawn).toHaveBeenCalledTimes(1)
  })
})
