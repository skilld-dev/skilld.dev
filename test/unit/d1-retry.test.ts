import { describe, expect, it, vi } from 'vitest'
import { createD1ReadRetryDatabase, retryD1Read, retryIdempotentD1Write } from '#server/utils/db'

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

describe('d1 read retries', () => {
  it.each([
    'D1_ERROR: D1 DB is overloaded. Requests queued for too long.',
    'D1_ERROR: Currently processing a long-running export.',
    'D1_ERROR: {"D1_RESET_DO":true}',
  ])('retries the transient platform failure: %s', async (message) => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValueOnce('recovered')

    await expect(retryD1Read(operation, {
      maxAttempts: 2,
      sleep: vi.fn(async () => {}),
    })).resolves.toBe('recovered')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('re-prepares bound reads for every attempt but never replays a write', async () => {
    const all = vi.fn()
      .mockRejectedValueOnce(new Error('D1_ERROR: Network connection lost.'))
      .mockResolvedValueOnce({ results: [{ id: 1 }] })
    const run = vi.fn().mockRejectedValue(new Error('D1_ERROR: Network connection lost.'))
    const bind = vi.fn(() => ({ all, run }))
    const prepare = vi.fn(() => ({ bind }))
    const sleep = vi.fn(async () => {})
    const db = createD1ReadRetryDatabase({ prepare } as unknown as D1Database, {
      maxAttempts: 2,
      sleep,
    })

    await expect(db.prepare('SELECT id FROM skills WHERE name = ?').bind('test').all())
      .resolves
      .toEqual({ results: [{ id: 1 }] })
    expect(prepare).toHaveBeenCalledTimes(2)
    expect(bind).toHaveBeenCalledTimes(2)

    await expect(db.prepare('UPDATE skills SET name = ?').bind('test').run())
      .rejects
      .toThrow('Network connection lost')
    expect(run).toHaveBeenCalledOnce()
  })

  it('does not stack retry facades for context-less internal requests', () => {
    const db = { prepare: vi.fn() } as unknown as D1Database
    const retrying = createD1ReadRetryDatabase(db)

    expect(createD1ReadRetryDatabase(retrying)).toBe(retrying)
  })

  it('unwraps statements for a single non-replayed D1 batch', async () => {
    const rawBound = { run: vi.fn() } as unknown as D1PreparedStatement
    const rawPrepared = {
      bind: vi.fn(() => rawBound),
    } as unknown as D1PreparedStatement
    const batch = vi.fn(async () => [])
    const db = createD1ReadRetryDatabase({
      prepare: vi.fn(() => rawPrepared),
      batch,
    } as unknown as D1Database)
    const statement = db.prepare('UPDATE skills SET name = ?').bind('test')

    await db.batch([statement])

    expect(batch).toHaveBeenCalledOnce()
    expect(batch).toHaveBeenCalledWith([rawBound])
  })
})
