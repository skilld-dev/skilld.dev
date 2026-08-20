import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recomputeIndexabilityForSkill } from '../../layers/registry/server/utils/recompute-scores'

describe('score recomputation identity and source health', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        stars INTEGER NOT NULL DEFAULT 0,
        pushed_at INTEGER,
        broken_since INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        installs INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        current_sha TEXT,
        sync_status TEXT,
        references_count INTEGER NOT NULL DEFAULT 0,
        is_official INTEGER NOT NULL DEFAULT 0,
        owner_verified INTEGER NOT NULL DEFAULT 0,
        source_resolved INTEGER NOT NULL DEFAULT 0,
        curator_count INTEGER NOT NULL DEFAULT 0,
        curator_reason_count INTEGER NOT NULL DEFAULT 0,
        approved_social_count INTEGER NOT NULL DEFAULT 0,
        author_social_count INTEGER NOT NULL DEFAULT 0,
        seo_index_score INTEGER NOT NULL DEFAULT 0,
        seo_indexable INTEGER NOT NULL DEFAULT 0,
        seo_index_reasons TEXT NOT NULL DEFAULT '[]',
        seo_index_synced_at INTEGER,
        trust_tier TEXT NOT NULL DEFAULT 'untrusted',
        trust_source TEXT NOT NULL DEFAULT 'computed',
        trust_score INTEGER NOT NULL DEFAULT 0,
        trust_reasons TEXT NOT NULL DEFAULT '[]',
        trust_synced_at INTEGER,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE repo_trust_overrides (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        tier TEXT NOT NULL,
        reason TEXT,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE collections_v2 (
        id INTEGER PRIMARY KEY,
        deleted_at INTEGER
      );
      CREATE TABLE collection_skills_v2 (
        collection_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT,
        reason TEXT
      );
      CREATE TABLE skill_social_posts (
        skill_slug TEXT NOT NULL,
        status TEXT NOT NULL,
        role TEXT
      );

      INSERT INTO repos (owner, repo, stars, pushed_at, broken_since) VALUES
        ('acme', 'one', 1000, unixepoch(), NULL),
        ('acme', 'two', 1000, unixepoch(), NULL),
        ('acme', 'broken', 1000, unixepoch(), unixepoch()),
        ('acme', 'missing', 1000, unixepoch(), NULL);
      INSERT INTO skills (
        owner, repo, name, slug, installs, description, current_sha, sync_status,
        source_resolved, curator_count, curator_reason_count,
        seo_index_score, seo_indexable, trust_tier, trust_source
      ) VALUES
        ('acme', 'one', 'shared', 'acme/one/shared', 2000, 'One', 'sha-one', 'ok',
         0, 0, 0, 0, 0, 'untrusted', 'computed'),
        ('acme', 'two', 'shared', 'acme/two/shared', 2000, 'Two', 'sha-two', 'ok',
         0, 77, 77, 77, 1, 'trusted', 'override'),
        ('acme', 'broken', 'broken-skill', 'acme/broken/broken-skill', 2000, 'Broken', 'sha-broken', 'ok',
         1, 0, 0, 20, 1, 'trusted', 'computed'),
        ('acme', 'missing', 'missing-skill', 'acme/missing/missing-skill', 2000, 'Missing', 'sha-missing', 'repo_missing',
         1, 0, 0, 20, 1, 'trusted', 'computed'),
        ('acme', 'one', 'deleted-skill', 'acme/one/deleted-skill', 2000, 'Deleted', 'sha-deleted', 'path_missing',
         0, 0, 0, 0, 0, 'quarantined', 'computed');
      INSERT INTO collections_v2 (id, deleted_at) VALUES (1, NULL);
      INSERT INTO collection_skills_v2 (collection_id, owner, repo, name, reason)
      VALUES (1, 'acme', 'one', 'shared', 'A reason long enough to count for scoring.');
    `)
    db = wrapSqlite(sqlite)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('updates only the selected full skill identity', async () => {
    await recomputeIndexabilityForSkill(db, {
      owner: 'acme',
      repo: 'one',
      name: 'shared',
    })

    expect(readSkill('one', 'shared')).toMatchObject({
      curator_count: 1,
      curator_reason_count: 1,
    })
    expect(readSkill('two', 'shared')).toMatchObject({
      curator_count: 77,
      curator_reason_count: 77,
      seo_index_score: 77,
      seo_indexable: 1,
      trust_tier: 'trusted',
      trust_source: 'override',
    })
  })

  it('does not borrow curator evidence from a sibling repository', async () => {
    await recomputeIndexabilityForSkill(db, {
      owner: 'acme',
      repo: 'two',
      name: 'shared',
    })

    expect(readSkill('two', 'shared')).toMatchObject({
      curator_count: 0,
      curator_reason_count: 0,
    })
  })

  // The repo sweep quarantines a skill whose SKILL.md was deleted while the
  // repository itself is fine. Deriving `source_resolved` from repo facts alone
  // resurrected it within five minutes, so 342 removed skills served 200.
  it('leaves a skill unresolved when only its file is gone', async () => {
    await recomputeIndexabilityForSkill(db, {
      owner: 'acme',
      repo: 'one',
      name: 'deleted-skill',
    })

    expect(readSkill('one', 'deleted-skill')).toMatchObject({
      source_resolved: 0,
      seo_indexable: 0,
    })
  })

  it.each([
    ['broken', 'broken-skill'],
    ['missing', 'missing-skill'],
  ])('marks %s repository sources unresolved', async (repo, name) => {
    await recomputeIndexabilityForSkill(db, { owner: 'acme', repo, name })

    expect(readSkill(repo, name)).toMatchObject({
      source_resolved: 0,
      seo_indexable: 0,
    })
  })

  function readSkill(repo: string, name: string): Record<string, unknown> {
    return sqlite.prepare(
      `SELECT source_resolved, curator_count, curator_reason_count,
              seo_index_score, seo_indexable, trust_tier, trust_source
       FROM skills
       WHERE owner = 'acme' AND repo = ? AND name = ?`,
    ).get(repo, name) as Record<string, unknown>
  }
})

function wrapSqlite(sqlite: Database.Database): D1Database {
  const prepare = (sql: string) => {
    const bindings = (params: unknown[]) =>
      Object.fromEntries(params.map((value, index) => [String(index + 1), value]))
    const makeStatement = (params: unknown[]): D1PreparedStatement => ({
      bind: (...nextParams: unknown[]) => makeStatement(nextParams),
      async run() {
        const statement = sqlite.prepare(sql)
        const result = params.length ? statement.run(bindings(params)) : statement.run()
        return { meta: { changes: result.changes } } as D1Result
      },
      async first<T>() {
        const statement = sqlite.prepare(sql)
        return ((params.length ? statement.get(bindings(params)) : statement.get()) as T | undefined) ?? null
      },
      async all<T>() {
        const statement = sqlite.prepare(sql)
        const results = params.length ? statement.all(bindings(params)) : statement.all()
        return { results: results as T[] } as D1Result<T>
      },
    }) as D1PreparedStatement
    return makeStatement([])
  }

  return { prepare } as D1Database
}
