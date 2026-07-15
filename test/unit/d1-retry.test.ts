import { describe, expect, it, vi } from 'vitest'
import { retryIdempotentD1Write } from '#shared/server/db'

describe('retryIdempotentD1Write', () => {
  it('retries transient D1 errors with exponential backoff and jitter', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('D1_ERROR: Network connection lost.'))
      .mockRejectedValueOnce(new Error('D1_ERROR: storage caused object to be reset'))
      .mockResolvedValue('ok')
    const delays: number[] = []

    const result = await retryIdempotentD1Write(operation, {
      baseDelayMs: 10,
      random: () => 0,
      sleep: async delayMs => void delays.push(delayMs),
    })

    expect(result).toBe('ok')
    expect(operation).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([5, 10])
  })

  it('does not retry application or SQL errors', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('D1_ERROR: UNIQUE constraint failed'))
    const sleep = vi.fn()

    await expect(retryIdempotentD1Write(operation, { sleep })).rejects.toThrow('UNIQUE constraint failed')
    expect(operation).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('stops after the configured attempt limit', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('D1_ERROR: Cannot resolve D1 DB due to transient issue on remote node.'))

    await expect(retryIdempotentD1Write(operation, {
      maxAttempts: 3,
      sleep: async () => {},
    })).rejects.toThrow('transient issue')
    expect(operation).toHaveBeenCalledTimes(3)
  })
})
