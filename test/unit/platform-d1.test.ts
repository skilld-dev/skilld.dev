import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlatformD1 } from '../../server/utils/db'

function database(run: () => Promise<unknown>) {
  const statement = {
    bind: vi.fn(function () { return this }),
    first: vi.fn(run),
    run: vi.fn(run),
  }
  const session = {
    prepare: vi.fn(() => statement),
    batch: vi.fn(async () => []),
    getBookmark: vi.fn(() => null),
  }
  const db = {
    withSession: vi.fn(() => session),
  }

  return {
    db: db as unknown as D1Database,
    session,
    statement,
  }
}

describe('createPlatformD1', () => {
  it('retries a read blocked by a D1 import', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('D1_ERROR: Currently processing a long-running import.'))
      .mockResolvedValue({ id: 1 })
    const { db } = database(run)
    const env = { DB: db } as Cloudflare.Env

    const platformDb = createPlatformD1(env, { sleep: async () => {} }).database
    const row = await platformDb.prepare('SELECT id FROM skills').first<{ id: number }>()

    expect(row).toEqual({ id: 1 })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('retries a read blocked by a D1 import job', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('D1_ERROR: Currently processing an import job.'))
      .mockResolvedValue({ id: 1 })
    const { db } = database(run)
    const env = { DB: db } as Cloudflare.Env

    const platformDb = createPlatformD1(env, { sleep: async () => {} }).database
    const row = await platformDb.prepare('SELECT id FROM skills').first<{ id: number }>()

    expect(row).toEqual({ id: 1 })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('retries a read blocked by a D1 export', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('D1_ERROR: Currently processing a long-running export.'))
      .mockResolvedValue({ id: 1 })
    const { db } = database(run)
    const env = { DB: db } as Cloudflare.Env

    const platformDb = createPlatformD1(env, { sleep: async () => {} }).database
    const row = await platformDb.prepare('SELECT id FROM skills').first<{ id: number }>()

    expect(row).toEqual({ id: 1 })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('retries a read rejected by an overloaded D1 database', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('D1_ERROR: D1 DB is overloaded. Requests queued for too long.'))
      .mockResolvedValue({ id: 1 })
    const { db } = database(run)
    const env = { DB: db } as Cloudflare.Env

    const platformDb = createPlatformD1(env, { sleep: async () => {} }).database
    const row = await platformDb.prepare('SELECT id FROM skills').first<{ id: number }>()

    expect(row).toEqual({ id: 1 })
    expect(run).toHaveBeenCalledTimes(2)
  })

  describe('an overload longer than a few hundred milliseconds', () => {
    const overloaded = () => new Error('D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window.')

    beforeEach(() => {
      vi.useFakeTimers({ now: 0 })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    /** A read whose statement fails with an overload until `clearsAt` ms on the fake clock. */
    function overloadedDatabase(clearsAt: number) {
      return database(async () => {
        if (Date.now() < clearsAt)
          throw overloaded()
        return { id: 1 }
      })
    }

    async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
      const settled = Promise.allSettled([promise])
      await vi.runAllTimersAsync()
      return (await settled)[0]!
    }

    // SKILLD-5K, SKILLD-50: most bursts in the 2026-11 events ran 1 to 6 s.
    it.each([0, 1])('keeps a read alive through a 2.5 s overload (jitter %s)', async (jitter) => {
      const { db } = overloadedDatabase(2_500)
      const platformDb = createPlatformD1({ DB: db } as Cloudflare.Env, { random: () => jitter }).database

      const result = await settle(platformDb.prepare('SELECT id FROM skills').first<{ id: number }>())

      expect(result).toEqual({ status: 'fulfilled', value: { id: 1 } })
    })

    it('fails with the overload error once the request has waited about 4 s', async () => {
      const { db } = overloadedDatabase(Number.POSITIVE_INFINITY)
      const platformDb = createPlatformD1({ DB: db } as Cloudflare.Env, { random: () => 1 }).database

      const result = await settle(platformDb.prepare('SELECT id FROM skills').first())

      expect(result.status).toBe('rejected')
      expect((result as PromiseRejectedResult).reason.message).toMatch('D1 DB is overloaded')
      expect(Date.now()).toBeLessThanOrEqual(4_000)
    })

    it('shares one wait budget across the parallel reads of a request', async () => {
      const { db } = overloadedDatabase(Number.POSITIVE_INFINITY)
      const platformDb = createPlatformD1({ DB: db } as Cloudflare.Env, { random: () => 1 }).database

      const results = await settle(Promise.allSettled([
        platformDb.prepare('SELECT id FROM skills').first(),
        platformDb.prepare('SELECT id FROM repos').first(),
      ]))

      expect(results.status === 'fulfilled' && results.value.map(read => read.status)).toEqual(['rejected', 'rejected'])
      expect(Date.now()).toBeLessThanOrEqual(4_000)
    })

    it('gives a later read in the same request no fresh budget', async () => {
      const { db } = overloadedDatabase(Number.POSITIVE_INFINITY)
      const platformDb = createPlatformD1({ DB: db } as Cloudflare.Env, { random: () => 1 }).database

      await settle(platformDb.prepare('SELECT id FROM skills').first())
      const spent = Date.now()
      const later = await settle(platformDb.prepare('SELECT id FROM repos').first())

      expect(later.status).toBe('rejected')
      expect(Date.now()).toBe(spent)
    })
  })

  it('does not replay a write rejected by an overloaded D1 database', async () => {
    const error = new Error('D1_ERROR: D1 DB is overloaded. Requests queued for too long.')
    const run = vi.fn().mockRejectedValue(error)
    const { db } = database(run)
    const env = { DB: db } as Cloudflare.Env

    const platformDb = createPlatformD1(env, { sleep: async () => {} }).database

    await expect(platformDb.prepare('UPDATE skills SET stars = 1').run()).rejects.toBe(error)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not replay a write blocked by a D1 import', async () => {
    const error = new Error('D1_ERROR: Currently processing a long-running import.')
    const run = vi.fn().mockRejectedValue(error)
    const { db } = database(run)
    const env = { DB: db } as Cloudflare.Env

    const platformDb = createPlatformD1(env, { sleep: async () => {} }).database

    await expect(platformDb.prepare('UPDATE skills SET stars = 1').run()).rejects.toBe(error)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('replays a read on a renewed session after D1 resets the durable object', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('D1_ERROR: {"D1_RESET_DO":true}'))
      .mockResolvedValue({ id: 1 })
    const { db } = database(run)
    const env = { DB: db } as Cloudflare.Env

    const platformDb = createPlatformD1(env).database
    const row = await platformDb.prepare('SELECT id FROM skills').first<{ id: number }>()

    expect(row).toEqual({ id: 1 })
    expect(run).toHaveBeenCalledTimes(2)
    expect(db.withSession).toHaveBeenCalledTimes(2)
  })

  it('passes native statements to a D1 batch', async () => {
    const { db, session, statement } = database(async () => ({ id: 1 }))
    const env = { DB: db } as Cloudflare.Env
    const platformDb = createPlatformD1(env).database

    await platformDb.batch([platformDb.prepare('SELECT id FROM skills')])

    expect(session.batch).toHaveBeenCalledWith([statement])
  })
})

describe('cloudflare bindings', () => {
  it('keeps the raw D1 binding for consumers that start their own session', () => {
    const { db } = database(async () => null)
    const env = { DB: db } as Cloudflare.Env

    const bindings = createPlatformD1(env).bindings

    expect(bindings.DB).toBe(db)
    expect(bindings.DB.withSession('first-primary')).toBeDefined()
  })
})
