import type { EventHandler, H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectDigestForUser } from '../../layers/identity/server/utils/digest-select'
import { importStarredPage, loadStarredRows } from '../../layers/identity/server/utils/starred-repos'
import { createRepositoryWatches, loadWatches } from '../../layers/identity/server/utils/watches'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'
import { SIGNED_IN_HEADERS } from './helpers/session'

describe('starred repository identity', () => {
  let d1: SqliteD1
  let subscribe: EventHandler

  beforeEach(async () => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec(`
      INSERT OR REPLACE INTO users (id, github_id, login, created_at, last_login_at, onboarded_at) VALUES (1, 11, 'test-user', 1, 1, 1);
      INSERT INTO repos (owner, repo, repo_kind, default_branch) VALUES ('leonxlnx', 'taste-skill', 'catalog', 'main');
      INSERT INTO skills (owner, repo, name, slug, display_name, current_sha, rendered_skill_path, source_resolved)
        VALUES ('leonxlnx', 'taste-skill', 'brandkit', 'leonxlnx/taste-skill/brandkit', 'Brandkit', 'blob', 'skills/brandkit/SKILL.md', 1);
      INSERT INTO activity (id, owner, repo, name, type, occurred_at, ingested_at, sha) VALUES (1, 'leonxlnx', 'taste-skill', 'brandkit', 'skill_updated', 10, 10, 'blob');
    `)
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
    vi.stubGlobal('getUserSession', async () => ({ user: { id: 1, login: 'test-user' } }))
    subscribe = (await import('../../layers/identity/server/api/me/subscriptions/index.post')).default
  })
  afterEach(() => {
    d1.close()
    vi.unstubAllGlobals()
  })

  async function importRepository(owner: string, repo: string) {
    return importStarredPage({
      db: d1.db,
      userId: 1,
      githubToken: 'fixture',
      page: 1,
      now: () => 20,
      fetch: async () => Response.json([{ starred_at: '2026-10-05T00:00:00Z', repo: { name: repo, owner: { login: owner } } }]),
    })
  }

  it('imports a differently cased GitHub repository using registry spelling', async () => {
    expect(await importRepository('Leonxlnx', 'Taste-Skill')).toMatchObject({ _tag: 'Imported', matched: 1 })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'leonxlnx', repo: 'taste-skill', has_skill: 1, skill_name: 'brandkit' }])
  })

  it('preserves deliberately mixed-case frozen registry identity', async () => {
    d1.raw.exec(`INSERT INTO repos (owner, repo) VALUES ('MixedOwner', 'Mixed-Skills');
      INSERT INTO skills (owner, repo, name, slug, display_name) VALUES ('MixedOwner', 'Mixed-Skills', 'motion', 'mixed/motion', 'Motion');`)
    await importRepository('mixedowner', 'mixed-skills')
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'MixedOwner', repo: 'Mixed-Skills', has_skill: 1 }])
  })

  it('finds current Skills in an old false import and recognizes a raw-case watch', async () => {
    d1.raw.exec(`INSERT INTO user_starred_repos VALUES (1, 'Leonxlnx', 'Taste-Skill', 10, 0);
      INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at) VALUES (1, 'LEONXLNX', 'TASTE-SKILL', 'manual', 10);`)
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'leonxlnx', repo: 'taste-skill', has_skill: 1, watching: 1, skill_name: 'brandkit' }])
  })

  it('creates one canonical watch, preserves its deliberate source and selects digest changes', async () => {
    d1.raw.exec(`INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at) VALUES (1, 'LEONXLNX', 'TASTE-SKILL', 'manual', 10);`)
    vi.stubGlobal('readBody', async () => ({ source: 'star-import', repos: [{ owner: 'Leonxlnx', repo: 'Taste-Skill' }] }))
    await subscribe({ method: 'POST', context: { platform: { db: d1.db } }, node: { req: { headers: SIGNED_IN_HEADERS } } } as unknown as H3Event)
    expect(d1.raw.prepare('SELECT owner, repo, source FROM skill_subscriptions').all()).toEqual([{ owner: 'leonxlnx', repo: 'taste-skill', source: 'manual' }])
    const selection = await selectDigestForUser(d1.db, { id: 1, login: 'test-user', digest_email: 'fixture@example.com', email: null, email_opt_in: 1, onboarded_at: 1 }, 20, { cursorStart: 0, cursorEnd: 1 })
    expect(selection?.entries).toMatchObject([{ owner: 'leonxlnx', repo: 'taste-skill', skillNames: ['brandkit'] }])
  })

  it('stores new star-import watches canonically for digest selection', async () => {
    vi.stubGlobal('readBody', async () => ({ source: 'star-import', repos: [{ owner: 'Leonxlnx', repo: 'Taste-Skill' }] }))
    await subscribe({ method: 'POST', context: { platform: { db: d1.db } }, node: { req: { headers: SIGNED_IN_HEADERS } } } as unknown as H3Event)
    expect(d1.raw.prepare('SELECT owner, repo, source FROM skill_subscriptions').all()).toEqual([{ owner: 'leonxlnx', repo: 'taste-skill', source: 'star-import' }])
    const selection = await selectDigestForUser(d1.db, { id: 1, login: 'test-user', digest_email: 'fixture@example.com', email: null, email_opt_in: 1, onboarded_at: 1 }, 20, { cursorStart: 0, cursorEnd: 1 })
    expect(selection?.entries[0]?.skillNames).toEqual(['brandkit'])
  })

  it('includes old mixed-case watches once when canonical duplicates coexist', async () => {
    d1.raw.exec(`INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at) VALUES
      (1, 'Leonxlnx', 'Taste-Skill', 'manual', 10),
      (1, 'leonxlnx', 'taste-skill', 'like', 11);`)
    const selection = await selectDigestForUser(d1.db, { id: 1, login: 'test-user', digest_email: 'fixture@example.com', email: null, email_opt_in: 1, onboarded_at: 1 }, 20, { cursorStart: 0, cursorEnd: 1 })
    expect(selection?.entries).toMatchObject([{ owner: 'leonxlnx', repo: 'taste-skill', changeCount: 1, skillNames: ['brandkit'] }])
  })

  it('keeps an unknown repository unmatched', async () => {
    expect(await importRepository('Unknown', 'unknown-skills')).toMatchObject({ matched: 0 })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'Unknown', repo: 'unknown-skills', has_skill: 0, skill_name: null }])
  })

  it('lists old and canonical watch duplicates as one canonical deliberate watch', async () => {
    d1.raw.exec(`INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at) VALUES
      (1, 'Leonxlnx', 'Taste-Skill', 'manual', 10),
      (1, 'leonxlnx', 'taste-skill', 'like', 11);`)
    expect(await loadWatches(d1.db, 1)).toMatchObject([{ owner: 'leonxlnx', repo: 'taste-skill', source: 'manual' }])
    await createRepositoryWatches(d1.db, 1, [{ owner: 'LEONXLNX', repo: 'TASTE-SKILL' }], 'star-import')
    expect(d1.raw.prepare('SELECT owner, repo, source FROM skill_subscriptions').all()).toEqual([{ owner: 'leonxlnx', repo: 'taste-skill', source: 'manual' }])
  })

  it('rejects an unknown watch before inserting any valid watch in the batch', async () => {
    await expect(createRepositoryWatches(d1.db, 1, [
      { owner: 'Leonxlnx', repo: 'Taste-Skill' },
      { owner: 'Unknown', repo: 'unknown-skills' },
    ], 'star-import')).rejects.toMatchObject({ statusCode: 404 })
    expect(await loadWatches(d1.db, 1)).toEqual([])
  })

  it('preserves a deliberate watch mute when replacing its like duplicate', async () => {
    d1.raw.exec(`INSERT INTO skill_subscriptions (user_id, owner, repo, source, muted_until, created_at) VALUES
      (1, 'Leonxlnx', 'Taste-Skill', 'manual', 999, 10),
      (1, 'leonxlnx', 'taste-skill', 'like', NULL, 11);
      INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (1, 'leonxlnx', 'taste-skill', 'brandkit', 10);`)
    const user = { id: 1, login: 'test-user', digest_email: 'fixture@example.com', email: null, email_opt_in: 1, onboarded_at: 1 }
    expect((await selectDigestForUser(d1.db, user, 20, { cursorStart: 0, cursorEnd: 1 }))?.entries).toEqual([])
    await createRepositoryWatches(d1.db, 1, [{ owner: 'LEONXLNX', repo: 'TASTE-SKILL' }], 'star-import')
    expect(await loadWatches(d1.db, 1)).toMatchObject([{ source: 'manual', muted_until: 999, created_at: 10 }])
  })
})
