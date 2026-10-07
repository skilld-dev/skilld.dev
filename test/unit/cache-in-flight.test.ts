import type { ReadThroughCache } from '../../shared/server/cache'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cached, readThroughCache, REFRESH_CLAIM_SECONDS } from '../../shared/server/cache'

const HOUR = 60 * 60

/**
 * A compute whose request ended while it ran. workerd drops the answer to
 * I/O of a request that has ended, so the compute never settles.
 */
function cutOff(): Promise<never> {
  return new Promise<never>(() => {})
}

afterEach(() => {
  vi.useRealTimers()
})

// A compute in flight belongs to the request that started it. A request that
// awaited another request's compute waited forever once that request ended,
// and so did every later request on that key in the isolate.
describe('a compute cut off with its request', () => {
  it('leaves a cold read to compute its own value', async () => {
    const storage = memoryStorage()

    void cached({ storage, key: 'cold:cached', ttlSeconds: 60, compute: cutOff })
    const second = cached({ storage, key: 'cold:cached', ttlSeconds: 60, compute: async () => 'second' })

    await expect(within(second, 1_000)).resolves.toBe('second')
  })

  it('leaves a cold read through to compute its own value', async () => {
    const storage = memoryStorage()

    void readThroughCache(storage, 'cold:read-through', cutOff, { ttl: 60 })
    const second = readThroughCache(storage, 'cold:read-through', async () => 'second', { ttl: 60 })

    await expect(within(second, 1_000)).resolves.toBe('second')
  })

  it('lets a stale read refresh once the refresh claim lapses', async () => {
    let now = 1_000_000
    const storage = memoryStorage({ 'stale:cached': { v: 'old', t: now - 120 } })
    const computes: string[] = []
    const read = (label: string, compute: () => Promise<string>) => cached({
      storage,
      key: 'stale:cached',
      ttlSeconds: 60,
      staleSeconds: HOUR,
      compute: () => {
        computes.push(label)
        return compute()
      },
      now: () => now,
    })

    expect(await read('first', cutOff)).toBe('old')
    expect(await read('second', async () => 'new')).toBe('old')
    expect(computes).toEqual(['first'])

    now += REFRESH_CLAIM_SECONDS + 1
    expect(await read('third', async () => 'new')).toBe('old')
    await vi.waitFor(() => expect(storage.entries.get('stale:cached')).toEqual({ v: 'new', t: now }))
    expect(computes).toEqual(['first', 'third'])
  })

  it('lets a stale read through recompute once the refresh claim lapses', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const storage = memoryStorage({ 'stale:read-through': { storedAt: Date.now() - (HOUR + 60) * 1000, value: 'old' } })
    const computes: string[] = []
    const read = (label: string, compute: () => Promise<string>) => readThroughCache(storage, 'stale:read-through', () => {
      computes.push(label)
      return compute()
    }, { ttl: HOUR, staleTtl: HOUR })

    void read('first', cutOff)
    await vi.waitFor(() => expect(computes).toEqual(['first']))
    expect(await read('second', async () => 'new')).toBe('old')

    vi.setSystemTime(Date.now() + (REFRESH_CLAIM_SECONDS + 1) * 1000)
    expect(await read('third', async () => 'new')).toBe('new')
    expect(computes).toEqual(['first', 'third'])
  })
})

describe('stale reads in one isolate', () => {
  it('start one refresh and serve the stale value meanwhile', async () => {
    const storage = memoryStorage({ 'stale:burst': { storedAt: Date.now() - (HOUR + 60) * 1000, value: 'old' } })
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const compute = vi.fn(async () => {
      await released
      return 'new'
    })

    const first = readThroughCache(storage, 'stale:burst', compute, { ttl: HOUR, staleTtl: HOUR })
    const rest = await Promise.all(Array.from({ length: 7 }, () => readThroughCache(storage, 'stale:burst', compute, { ttl: HOUR, staleTtl: HOUR })))
    release()

    expect(rest).toEqual(Array.from({ length: 7 }).fill('old'))
    expect(await first).toBe('new')
    expect(compute).toHaveBeenCalledOnce()
  })
})

/** A cache storage over a Map, which the test can read back. */
function memoryStorage(initial: Record<string, unknown> = {}): ReadThroughCache & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>(Object.entries(initial))
  return {
    entries,
    getItem: async <T>(key: string) => (entries.get(key) ?? null) as T | null,
    setItem: async (key: string, value: never) => {
      entries.set(key, value)
    },
  }
}

/** The promise's value, or a rejection if it takes longer than `ms`. */
async function within<A>(promise: Promise<A>, ms: number): Promise<A> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms)
  })
  return await Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}
