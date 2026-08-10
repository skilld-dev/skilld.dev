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
})
