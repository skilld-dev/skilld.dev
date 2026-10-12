import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importStarredPage, loadStarredRows, MAX_STAR_PAGES } from '../../layers/identity/server/utils/starred-repos'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const star = (name: string) => ({ starred_at: '2026-10-05T00:00:00Z', repo: { name, owner: { login: 'nuxt' } } })

describe('star import coverage', () => {
  let d1: SqliteD1
  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec(`INSERT OR REPLACE INTO users (id, github_id, login, created_at, last_login_at, stars_synced_at) VALUES (1, 11, 'reader', 1, 1, 9);
      INSERT INTO repos (owner, repo) VALUES ('nuxt', 'ui');
      INSERT INTO skills (owner, repo, name, slug, display_name) VALUES ('nuxt', 'ui', 'ui', 'nuxt/ui/ui', 'UI');
      INSERT INTO user_starred_repos VALUES (1, 'old', 'old-skills', 1, 0);
      INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at) VALUES (1, 'nuxt', 'ui', 'manual', 1);`)
  })
  afterEach(() => d1.close())
  const request = (page: number, response: Response) => importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page, now: () => 20, fetch: async () => response })

  it('matches a registry Repository without skill in its name', async () => {
    expect(await request(1, Response.json([star('ui')]))).toMatchObject({ matched: 1, total: 1, importedAt: 20 })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ repo: 'ui', has_skill: 1, watching: 1 }])
  })
  it('retains the last usable import when GitHub rejects page one', async () => {
    expect(await request(1, new Response(null, { status: 401 }))).toEqual({ _tag: 'GithubSignInRequired' })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'old', repo: 'old-skills' }])
  })
  it('retains the previous import when a later page fails', async () => {
    await request(1, Response.json(Array.from({ length: 100 }, (_, i) => star(`new-${i}`))))
    expect(await request(2, new Response(null, { status: 502 }))).toMatchObject({ _tag: 'GithubFailed' })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'old', repo: 'old-skills' }])
    expect(d1.raw.prepare('SELECT stars_synced_at FROM users WHERE id=1').get()).toMatchObject({ stars_synced_at: 9 })
  })
  it('replaces the import with an honest zero-match result without removing watches', async () => {
    expect(await request(1, Response.json([star('unlisted')]))).toMatchObject({ total: 1, matched: 0, hasMore: false, importedAt: 20 })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ repo: 'unlisted', has_skill: 0 }])
    expect(d1.raw.prepare('SELECT owner, repo FROM skill_subscriptions').all()).toEqual([{ owner: 'nuxt', repo: 'ui' }])
  })
  it('returns bounded partial coverage without claiming a complete import', async () => {
    for (let page = 1; page < MAX_STAR_PAGES; page++)
      await request(page, Response.json(Array.from({ length: 100 }, (_, i) => star(`p${page}-${i}`))))
    expect(await request(MAX_STAR_PAGES, Response.json(Array.from({ length: 100 }, (_, i) => star(`p10-${i}`))))).toMatchObject({ total: 1000, hasMore: false, importedAt: null })
    expect(d1.raw.prepare('SELECT stars_synced_at FROM users WHERE id=1').get()).toMatchObject({ stars_synced_at: null })
  })
})

describe('isolated import generations', () => {
  let d1: SqliteD1
  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec('INSERT OR REPLACE INTO users (id, github_id, login, created_at, last_login_at) VALUES (1, 11, \'reader\', 1, 1)')
  })
  afterEach(() => d1.close())
  const start = () => importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page: 1, fetch: async () => Response.json(Array.from({ length: 100 }, (_, i) => star(`repo-${i}`))) })

  it('rejects an old browser generation without publishing its rows', async () => {
    const older = await start()
    await start()
    if (older._tag !== 'Imported')
      throw new Error('Fixture import failed')
    expect(await importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page: 2, importId: older.importId, fetch: async () => Response.json([star('obsolete')]) })).toEqual({ _tag: 'ImportRestartRequired' })
    expect(await loadStarredRows(d1.db, 1)).toEqual([])
  })
  it('rejects an in-flight page if another browser restarts the import', async () => {
    const older = await start()
    if (older._tag !== 'Imported')
      throw new Error('Fixture import failed')
    let release!: (response: Response) => void
    const pendingResponse = new Promise<Response>((resolve) => {
      release = resolve
    })
    let entered!: () => void
    const fetching = new Promise<void>((resolve) => {
      entered = resolve
    })
    const pending = importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page: 2, importId: older.importId, fetch: async () => {
      entered()
      return pendingResponse
    } })
    await fetching
    await start()
    release(Response.json([star('obsolete')]))
    expect(await pending).toEqual({ _tag: 'ImportRestartRequired' })
    expect(await loadStarredRows(d1.db, 1)).toEqual([])
  })
  it('rejects out-of-order pages without replacing an active import', async () => {
    await start()
    expect(await importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page: 3, fetch: async () => Response.json([]) })).toEqual({ _tag: 'ImportRestartRequired' })
    expect(await loadStarredRows(d1.db, 1)).toEqual([])
  })
  it('uses GitHub pagination to complete an exactly full final page', async () => {
    const response = await importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page: 1, now: () => 20, fetch: async () => Response.json(Array.from({ length: 100 }, (_, i) => star(`repo-${i}`)), { headers: { link: '<https://api.github.com/user/starred?page=1>; rel="first"' } }) })
    expect(response).toMatchObject({ total: 100, hasMore: false, importedAt: 20 })
  })
})
