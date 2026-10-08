import { describe, expect, it, vi } from 'vitest'
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
