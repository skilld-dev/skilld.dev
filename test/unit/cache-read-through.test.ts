import type { ReadThroughCache } from '../../shared/server/cache'
import { describe, expect, it, vi } from 'vitest'
import { readThroughCache } from '../../shared/server/cache'

const HOUR = 60 * 60

function fakeStorage(raw: unknown) {
  const getItem = vi.fn(async () => raw)
  const setItem = vi.fn(async () => {})
  const storage = { getItem, setItem } as unknown as ReadThroughCache
  return { storage, getItem, setItem }
}

describe('readThroughCache', () => {
  it('serves a fresh envelope without recomputing', async () => {
    const value = { commits: [] }
    const { storage, getItem, setItem } = fakeStorage({ storedAt: Date.now() - 1000, value })
    const compute = vi.fn(async () => ({ commits: ['recomputed'] }))

    await expect(readThroughCache(storage, 'skills:related:v3:acme/skills/deploy', compute, { ttl: HOUR, staleTtl: HOUR }))
      .resolves
      .toEqual(value)

    expect(getItem).toHaveBeenCalledWith('skills:related:v3:acme/skills/deploy')
    expect(compute).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('recomputes and stores a fresh envelope when the entry is stale', async () => {
    const stale = { commits: ['old'] }
    const fresh = { commits: ['new'] }
    const { storage, setItem } = fakeStorage({ storedAt: Date.now() - (HOUR + 60) * 1000, value: stale })
    const compute = vi.fn(async () => fresh)

    await expect(readThroughCache(storage, 'skills:related:v3:acme/skills/deploy', compute, { ttl: HOUR, staleTtl: HOUR }))
      .resolves
      .toBe(fresh)

    expect(compute).toHaveBeenCalledOnce()
    expect(setItem).toHaveBeenCalledWith(
      'skills:related:v3:acme/skills/deploy',
      { storedAt: expect.any(Number), value: fresh },
      { ttl: HOUR * 2 },
    )
  })

  it('serves the stale value when the recompute fails', async () => {
    const stale = { commits: ['old'] }
    const { storage, setItem } = fakeStorage({ storedAt: Date.now() - (HOUR + 60) * 1000, value: stale })
    const compute = vi.fn(async () => {
      throw new Error('D1 DB is overloaded')
    })

    await expect(readThroughCache(storage, 'skills:related:v3:acme/skills/deploy', compute, { ttl: HOUR, staleTtl: HOUR }))
      .resolves
      .toEqual(stale)

    expect(compute).toHaveBeenCalledOnce()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('computes on a cold miss and stores an envelope', async () => {
    const value = { commits: ['fresh'] }
    const { storage, setItem } = fakeStorage(null)
    const compute = vi.fn(async () => value)

    await expect(readThroughCache(storage, 'skills:related:v3:acme/skills/deploy', compute, { ttl: HOUR, staleTtl: HOUR }))
      .resolves
      .toBe(value)

    expect(setItem).toHaveBeenCalledWith(
      'skills:related:v3:acme/skills/deploy',
      { storedAt: expect.any(Number), value },
      { ttl: HOUR * 2 },
    )
  })

  it('propagates a recompute failure when there is nothing stale to serve', async () => {
    const { storage, setItem } = fakeStorage(null)
    const compute = vi.fn(async () => {
      throw new Error('D1 DB is overloaded')
    })

    await expect(readThroughCache(storage, 'skills:related:v3:acme/skills/deploy', compute, { ttl: HOUR, staleTtl: HOUR }))
      .rejects
      .toThrow('D1 DB is overloaded')

    expect(setItem).not.toHaveBeenCalled()
  })

  it('stops serving a value once it passes the stale window', async () => {
    const { storage, setItem } = fakeStorage({ storedAt: Date.now() - (HOUR * 2 + 60) * 1000, value: { commits: ['ancient'] } })
    const compute = vi.fn(async () => {
      throw new Error('D1 DB is overloaded')
    })

    await expect(readThroughCache(storage, 'skills:related:v3:acme/skills/deploy', compute, { ttl: HOUR, staleTtl: HOUR }))
      .rejects
      .toThrow('D1 DB is overloaded')

    expect(setItem).not.toHaveBeenCalled()
  })
})
