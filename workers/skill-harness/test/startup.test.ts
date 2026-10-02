import { afterEach, expect, it, vi } from 'vitest'
import { startOutsideLock } from '../src/startup'

afterEach(() => vi.useRealTimers())

it('allows cold startup longer than the concurrency lock deadline', async () => {
  vi.useFakeTimers()
  let launched = false
  const lock = async <T>(callback: () => Promise<T>) => {
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Lock exceeded thirty seconds')), 30000)
    })
    return Promise.race([callback(), timeout]).finally(() => clearTimeout(timer))
  }
  const running = startOutsideLock(lock, async () => 'claimed', async (state) => {
    expect(state).toBe('claimed')
    await new Promise(resolve => setTimeout(resolve, 31000))
    launched = true
  })
  const completion = running.then(() => true, () => false)
  await vi.advanceTimersByTimeAsync(31000)
  expect(await completion).toBe(true)
  expect(launched).toBe(true)
})

it('does not launch a duplicate job', async () => {
  let launched = false
  await expect(startOutsideLock(callback => callback(), async () => {
    throw new Error('JOB_ALREADY_STARTED')
  }, async () => {
    launched = true
  })).rejects.toThrow('JOB_ALREADY_STARTED')
  expect(launched).toBe(false)
})
