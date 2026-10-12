import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importStarredPage, importStarredRepositories, loadStarredRows } from '../../layers/identity/server/utils/starred-repos'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const star = (name: string) => ({ starred_at: '2026-10-05T00:00:00Z', repo: { name, owner: { login: 'reader' } } })
describe('star import provider boundary', () => {
  let d1: SqliteD1
  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec(`INSERT OR REPLACE INTO users (id, github_id, login, created_at, last_login_at, stars_synced_at) VALUES (1, 11, 'reader', 1, 1, 9);
      INSERT INTO user_starred_repos VALUES (1, 'old', 'usable', 1, 0)`)
  })
  afterEach(() => d1.close())
  it.each([
    () => new Response('{'),
    () => Response.json({ message: 'Not a star list' }),
    () => Response.json([star('ui'), { repo: { name: 'invalid' } }]),
  ])('returns a recoverable provider failure for malformed successful responses', async (response) => {
    expect(await importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page: 1, fetch: async () => response() })).toEqual({ _tag: 'GithubInvalidResponse' })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'old', repo: 'usable' }])
    expect(d1.raw.prepare('SELECT stars_synced_at FROM users WHERE id=1').get()).toMatchObject({ stars_synced_at: 9 })
  })
  it('rejects generationless continuations instead of attaching them to a newer import', async () => {
    await importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page: 1, fetch: async () => Response.json(Array.from({ length: 100 }, (_, i) => star(`new-${i}`))) })
    expect(await importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page: 2, fetch: async () => Response.json([star('delayed')]) })).toEqual({ _tag: 'ImportRestartRequired' })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'old', repo: 'usable' }])
  })
})

describe('bounded server-owned import', () => {
  it('keeps 1000 stars within the per-request D1 query budget and reports partial coverage', async () => {
    const d1 = createSqliteD1(allMigrations(), { maximumQueries: 50 })
    d1.raw.exec('INSERT OR REPLACE INTO users (id, github_id, login, created_at, last_login_at) VALUES (1, 11, \'reader\', 1, 1)')
    const fetch = vi.fn(async (url: string) => Response.json(Array.from({ length: 100 }, (_, i) => star(`p${new URL(url).searchParams.get('page')}-${i}`))))
    const result = await importStarredRepositories({ db: d1.db, userId: 1, githubToken: 'fixture', fetch })
    expect(result).toMatchObject({ _tag: 'Imported', total: 1000, importedAt: null, hasMore: false })
    expect(fetch).toHaveBeenCalledTimes(10)
    expect(await loadStarredRows(d1.db, 1)).toHaveLength(1000)
    d1.close()
  })
})
