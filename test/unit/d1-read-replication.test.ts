import { describe, expect, it, vi } from 'vitest'
import {
  chooseD1Consistency,
  createPlatformD1,
  decideD1BookmarkCookie,
  parseD1Bookmark,
} from '../../server/utils/db'

const BOOKMARK = '0000002a-00000007-00005049-2d9a6b3c1f7e4d8a9b0c1d2e3f405162'

function database(bookmark: string | null = BOOKMARK) {
  const statement = {
    bind: vi.fn(function (this: unknown) { return this }),
    first: vi.fn(async () => ({ id: 1 })),
    run: vi.fn(async () => ({ success: true })),
    all: vi.fn(async () => ({ results: [] })),
    raw: vi.fn(async () => []),
  }
  const session = {
    prepare: vi.fn(() => statement),
    batch: vi.fn(async () => []),
    getBookmark: vi.fn(() => bookmark),
  }
  const db = { withSession: vi.fn(() => session) }
  return { env: { DB: db as unknown as D1Database } as Cloudflare.Env, db, session }
}

describe('chooseD1Consistency', () => {
  it('lets an anonymous read start on any replica', () => {
    expect(chooseD1Consistency({ method: 'GET', bookmark: null })).toEqual({ _tag: 'first-unconstrained' })
    expect(chooseD1Consistency({ method: 'HEAD', bookmark: null })).toEqual({ _tag: 'first-unconstrained' })
  })

  it('continues from the bookmark of an earlier write', () => {
    expect(chooseD1Consistency({ method: 'GET', bookmark: BOOKMARK }))
      .toEqual({ _tag: 'bookmark', bookmark: BOOKMARK })
  })

  it('starts a mutating request on the primary even with a bookmark', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
      expect(chooseD1Consistency({ method, bookmark: BOOKMARK })).toEqual({ _tag: 'first-primary' })
  })
})

describe('parseD1Bookmark', () => {
  it('accepts a bookmark D1 issued', () => {
    expect(parseD1Bookmark(BOOKMARK)).toBe(BOOKMARK)
  })

  it('rejects a missing or tampered value', () => {
    expect(parseD1Bookmark(undefined)).toBeNull()
    expect(parseD1Bookmark('')).toBeNull()
    expect(parseD1Bookmark('first-primary')).toBeNull()
    expect(parseD1Bookmark('first-unconstrained')).toBeNull()
    expect(parseD1Bookmark('x'.repeat(600))).toBeNull()
    expect(parseD1Bookmark('abc;\u0000drop')).toBeNull()
  })
})

describe('createPlatformD1 consistency', () => {
  it('starts the request session with the chosen constraint', async () => {
    const { env, db } = database()
    const platform = createPlatformD1(env, { consistency: { _tag: 'first-unconstrained' } })

    await platform.database.prepare('SELECT id FROM skills').first()

    expect(db.withSession).toHaveBeenCalledWith('first-unconstrained')
  })

  it('starts a bookmark session from the bookmark itself', async () => {
    const { env, db } = database()
    const platform = createPlatformD1(env, { consistency: { _tag: 'bookmark', bookmark: BOOKMARK } })

    await platform.database.prepare('SELECT id FROM skills').first()

    expect(db.withSession).toHaveBeenCalledWith(BOOKMARK)
  })

  it('keeps the primary as the default for callers that choose nothing', async () => {
    const { env, db } = database()

    await createPlatformD1(env).database.prepare('SELECT id FROM skills').first()

    expect(db.withSession).toHaveBeenCalledWith('first-primary')
  })

  it('reports the session bookmark after a write completes', async () => {
    const { env } = database()
    const onWrite = vi.fn()
    const platform = createPlatformD1(env, { onWrite })

    await platform.database.prepare('UPDATE skills SET stars = ?').bind(1).run()

    expect(onWrite).toHaveBeenCalledWith(BOOKMARK)
  })

  it('reports a write sent inside a batch', async () => {
    const { env } = database()
    const onWrite = vi.fn()
    const platform = createPlatformD1(env, { onWrite })

    await platform.database.batch([
      platform.database.prepare('SELECT id FROM skills'),
      platform.database.prepare('INSERT INTO likes (skill_id) VALUES (?)').bind(1),
    ])

    expect(onWrite).toHaveBeenCalledWith(BOOKMARK)
  })

  it('reports nothing for reads', async () => {
    const { env } = database()
    const onWrite = vi.fn()
    const platform = createPlatformD1(env, { onWrite })

    await platform.database.prepare('SELECT id FROM skills').all()
    await platform.database.batch([platform.database.prepare('SELECT 1')])

    expect(onWrite).not.toHaveBeenCalled()
  })
})

describe('decideD1BookmarkCookie', () => {
  const privateHeaders = ['private, no-store', 'private, no-store']

  it('sets the bookmark on a private response', () => {
    expect(decideD1BookmarkCookie({ bookmark: BOOKMARK, responseSent: false, cacheControl: privateHeaders }))
      .toEqual({ _tag: 'set', bookmark: BOOKMARK })
  })

  it('lets the CDN fall back to a private Cache-Control', () => {
    expect(decideD1BookmarkCookie({ bookmark: BOOKMARK, responseSent: false, cacheControl: ['private, no-store', undefined] }))
      .toEqual({ _tag: 'set', bookmark: BOOKMARK })
  })

  it('never sets a cookie on a response a shared cache may store', () => {
    for (const cacheControl of [
      ['public, max-age=60', undefined],
      [undefined, 'public, max-age=60'],
      ['private, no-store', 'max-age=60'],
      [undefined, undefined],
    ]) {
      expect(decideD1BookmarkCookie({ bookmark: BOOKMARK, responseSent: false, cacheControl }))
        .toEqual({ _tag: 'skip', reason: 'shared-cacheable' })
    }
  })

  it('skips a write that finished after the response left', () => {
    expect(decideD1BookmarkCookie({ bookmark: BOOKMARK, responseSent: true, cacheControl: privateHeaders }))
      .toEqual({ _tag: 'skip', reason: 'response-sent' })
  })

  it('skips when the session has no bookmark', () => {
    expect(decideD1BookmarkCookie({ bookmark: null, responseSent: false, cacheControl: privateHeaders }))
      .toEqual({ _tag: 'skip', reason: 'no-bookmark' })
  })
})
