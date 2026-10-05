import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { selectDigestForUser } from '../../layers/identity/server/utils/digest-select'

describe('digest selection', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE activity (
        id INTEGER PRIMARY KEY,
        owner TEXT,
        repo TEXT,
        name TEXT,
        occurred_at INTEGER,
        ingested_at INTEGER,
        sha TEXT
      );
      CREATE TABLE skills (
        owner TEXT,
        repo TEXT,
        name TEXT,
        description TEXT,
        current_sha TEXT,
        rendered_skill_path TEXT
      );
      CREATE TABLE repos (
        owner TEXT,
        repo TEXT,
        repo_kind TEXT,
        default_branch TEXT
      );
      CREATE TABLE skill_subscriptions (
        user_id INTEGER,
        owner TEXT,
        repo TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        muted_until INTEGER,
        created_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE skill_likes (
        user_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, owner, repo, name)
      );
      CREATE TABLE skill_revisions (
        owner TEXT,
        repo TEXT,
        name TEXT,
        sha TEXT,
        modified_at INTEGER,
        message TEXT,
        PRIMARY KEY (owner, repo, name, sha)
      );

      INSERT INTO skills VALUES ('nuxt', 'nuxt', 'nuxt', 'Nuxt framework', 'blob-new', 'skills/nuxt/SKILL.md');
      INSERT INTO repos VALUES ('nuxt', 'nuxt', 'source', 'main');
      INSERT INTO skill_subscriptions (user_id, owner, repo, source, muted_until) VALUES (1, 'nuxt', 'nuxt', 'manual', NULL);
      INSERT INTO activity VALUES (1, 'nuxt', 'nuxt', 'nuxt', 500, 1500, 'blob-old');
      INSERT INTO activity VALUES (2, 'nuxt', 'nuxt', 'nuxt', 1500, 1600, 'blob-new');
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'nuxt', 'commit-old', 500, 'old change');
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'nuxt', 'commit-new', 1500, 'new change');
    `)
    db = wrapSqlite(sqlite)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('selects an explicit durable activity cursor window', async () => {
    const selection = await selectDigestForUser(db, digestUser(), 2000, {
      windowStart: 1000,
      cursorStart: 1,
      cursorEnd: 2,
    })

    expect(selection?.windowStart).toBe(1000)
    expect(selection?.cursorStart).toBe(1)
    expect(selection?.cursorEnd).toBe(2)
    expect(selection?.entries[0]?.changeCount).toBe(1)
    expect(selection?.entries[0]?.skills[0]?.commitMessages).toEqual(['new change'])
    expect(selection?.entries[0]).not.toHaveProperty('skillName')
    expect(selection?.entries[0]).not.toHaveProperty('description')
    expect(selection?.entries[0]).not.toHaveProperty('commitCount')
    expect(selection?.entries[0]).not.toHaveProperty('commitMessages')
  })

  it('derives CLI cursor bounds from ingestion time', async () => {
    const selection = await selectDigestForUser(db, digestUser(), 2000, { windowStart: 0 })

    expect(selection?.windowStart).toBe(0)
    expect(selection?.cursorStart).toBe(0)
    expect(selection?.cursorEnd).toBe(2)
    expect(selection?.entries[0]?.changeCount).toBe(2)
    expect(selection?.entries[0]?.skills[0]?.commitMessages).toEqual(['new change', 'old change'])
  })

  it('retains sorted skill names and per-skill counts for a multi-skill repo', async () => {
    sqlite.exec(`
      INSERT INTO skills VALUES ('nuxt', 'nuxt', 'zeta', 'Zeta helper', 'blob-z2', 'skills/zeta/SKILL.md');
      INSERT INTO activity VALUES (3, 'nuxt', 'nuxt', 'zeta', 100, 1700, 'blob-z1');
      INSERT INTO activity VALUES (4, 'nuxt', 'nuxt', 'zeta', 101, 1701, 'blob-z2');
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'zeta', 'commit-z1', 100, 'zeta first');
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'zeta', 'commit-z2', 101, 'zeta second');
    `)

    const selection = await selectDigestForUser(db, digestUser(), 2000, {
      windowStart: 0,
      cursorStart: 0,
      cursorEnd: 4,
    })

    expect(selection?.entries[0]).toMatchObject({
      skillNames: ['nuxt', 'zeta'],
      changeCount: 4,
      skills: [
        { name: 'nuxt', changeCount: 2, commitMessages: ['new change', 'old change'] },
        { name: 'zeta', changeCount: 2, commitMessages: ['zeta second', 'zeta first'] },
      ],
    })
  })

  it('narrows a like-sourced subscription to the skills actually liked', async () => {
    sqlite.exec(`
      INSERT INTO skills VALUES ('nuxt', 'ui', 'design-tokens', 'Tokens', 'a', 'design-tokens/SKILL.md');
      INSERT INTO skills VALUES ('nuxt', 'ui', 'motion', 'Motion', 'b', 'motion/SKILL.md');
      INSERT INTO repos VALUES ('nuxt', 'ui', 'source', 'main');
      INSERT INTO skill_subscriptions (user_id, owner, repo, source, muted_until) VALUES (2, 'nuxt', 'ui', 'like', NULL);
      INSERT INTO skill_likes VALUES (2, 'nuxt', 'ui', 'design-tokens', 1);
      INSERT INTO activity VALUES (10, 'nuxt', 'ui', 'design-tokens', 1500, 1600, 'a');
      INSERT INTO activity VALUES (11, 'nuxt', 'ui', 'motion', 1500, 1600, 'b');
    `)

    const selection = await selectDigestForUser(db, digestUser({ id: 2 }), 2000, {
      windowStart: 0,
      cursorStart: 0,
      cursorEnd: 11,
    })

    expect(selection?.entries).toHaveLength(1)
    expect(selection?.entries[0]).toMatchObject({
      owner: 'nuxt',
      repo: 'ui',
      skillNames: ['design-tokens'],
      changeCount: 1,
    })
  })

  it('keeps whole-repo scope for a manually watched repo', async () => {
    sqlite.exec(`
      INSERT INTO skills VALUES ('nuxt', 'ui', 'design-tokens', 'Tokens', 'a', 'design-tokens/SKILL.md');
      INSERT INTO skills VALUES ('nuxt', 'ui', 'motion', 'Motion', 'b', 'motion/SKILL.md');
      INSERT INTO repos VALUES ('nuxt', 'ui', 'source', 'main');
      INSERT INTO skill_subscriptions (user_id, owner, repo, source, muted_until) VALUES (3, 'nuxt', 'ui', 'manual', NULL);
      INSERT INTO skill_likes VALUES (3, 'nuxt', 'ui', 'design-tokens', 1);
      INSERT INTO activity VALUES (10, 'nuxt', 'ui', 'design-tokens', 1500, 1600, 'a');
      INSERT INTO activity VALUES (11, 'nuxt', 'ui', 'motion', 1500, 1600, 'b');
    `)

    const selection = await selectDigestForUser(db, digestUser({ id: 3 }), 2000, {
      windowStart: 0,
      cursorStart: 0,
      cursorEnd: 11,
    })

    expect(selection?.entries[0]).toMatchObject({
      skillNames: ['design-tokens', 'motion'],
      changeCount: 2,
    })
  })

  it('drops a like-sourced repo entirely when nothing liked in it changed', async () => {
    sqlite.exec(`
      INSERT INTO skills VALUES ('nuxt', 'ui', 'design-tokens', 'Tokens', 'a', 'design-tokens/SKILL.md');
      INSERT INTO skills VALUES ('nuxt', 'ui', 'motion', 'Motion', 'b', 'motion/SKILL.md');
      INSERT INTO repos VALUES ('nuxt', 'ui', 'source', 'main');
      INSERT INTO skill_subscriptions (user_id, owner, repo, source, muted_until) VALUES (4, 'nuxt', 'ui', 'like', NULL);
      INSERT INTO skill_likes VALUES (4, 'nuxt', 'ui', 'design-tokens', 1);
      INSERT INTO activity VALUES (11, 'nuxt', 'ui', 'motion', 1500, 1600, 'b');
    `)

    const selection = await selectDigestForUser(db, digestUser({ id: 4 }), 2000, {
      windowStart: 0,
      cursorStart: 0,
      cursorEnd: 11,
    })

    expect(selection?.entries).toEqual([])
  })

  it('links the SKILL.md at the branch and the change at its commit, never a blob sha', async () => {
    const selection = await selectDigestForUser(db, digestUser(), 2000, { windowStart: 0 })

    expect(selection?.entries[0]?.skills[0]).toMatchObject({
      sourceUrl: 'https://github.com/nuxt/nuxt/blob/main/skills/nuxt/SKILL.md',
      changeUrl: 'https://github.com/nuxt/nuxt/commit/commit-new',
    })
  })

  it('links the branch and the file history when no commit is recorded', async () => {
    sqlite.exec(`DELETE FROM skill_revisions`)

    const selection = await selectDigestForUser(db, digestUser(), 2000, { windowStart: 0 })

    expect(selection?.entries[0]?.skills[0]).toMatchObject({
      commitMessages: [],
      sourceUrl: 'https://github.com/nuxt/nuxt/blob/main/skills/nuxt/SKILL.md',
      changeUrl: 'https://github.com/nuxt/nuxt/commits/main/skills/nuxt/SKILL.md',
    })
  })

  it('omits a Skill when its exact source cannot be resolved', async () => {
    sqlite.exec(`
      INSERT INTO skills VALUES ('nuxt', 'nuxt', 'missing-source', 'Missing source', NULL, NULL);
      INSERT INTO activity VALUES (3, 'nuxt', 'nuxt', 'missing-source', 1600, 1700, 'missing');
    `)

    const selection = await selectDigestForUser(db, digestUser(), 2000, {
      windowStart: 0,
      cursorStart: 0,
      cursorEnd: 3,
    })

    expect(selection?.entries[0]).toMatchObject({
      skillNames: ['nuxt'],
      changeCount: 2,
    })
  })
})

function digestUser(overrides: Partial<ReturnType<typeof baseDigestUser>> = {}) {
  return { ...baseDigestUser(), ...overrides }
}

function baseDigestUser() {
  return {
    id: 1,
    login: 'harlan',
    digest_email: 'harlan@example.com',
    email: 'harlan@example.com',
    email_opt_in: 1,
    onboarded_at: 0,
  }
}

function wrapSqlite(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          const prepared = expandNumberedPlaceholders(sql, params)
          return {
            async run() {
              return sqlite.prepare(prepared.sql).run(...prepared.params)
            },
            async all<T>() {
              return { results: sqlite.prepare(prepared.sql).all(...prepared.params) as T[] }
            },
            async first<T>() {
              return (sqlite.prepare(prepared.sql).get(...prepared.params) as T | undefined) ?? null
            },
          }
        },
      }
    },
    batch: async <T>(statements: Array<{ all: <R>() => Promise<{ results: R[] }> }>) => {
      return Promise.all(statements.map(statement => statement.all<T>()))
    },
  } as unknown as D1Database
}

function expandNumberedPlaceholders(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
  const expanded: unknown[] = []
  const nextSql = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(params[Number(raw) - 1])
    return '?'
  })
  return expanded.length ? { sql: nextSql, params: expanded } : { sql, params }
}
