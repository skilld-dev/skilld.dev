import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { querySkills } from '../../layers/registry/server/utils/skills-registry'

describe('skills registry unique owner browse', () => {
  it('returns each owner once using their highest ranked skill', async () => {
    const sqlite = new Database(':memory:')
    let forbidSkillBodyRead = false
    sqlite.function('forbid_skill_body_read', { deterministic: true }, (owner: string) => {
      if (forbidSkillBodyRead)
        throw new Error('skill listings must not read stored Markdown bodies')
      return `# ${owner}`
    })
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        stars INTEGER NOT NULL,
        pushed_at INTEGER,
        broken_since INTEGER,
        repo_kind TEXT NOT NULL DEFAULT 'source',
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        slug TEXT NOT NULL,
        like_count INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        rendered_raw_sha256 TEXT,
        seo_index_score INTEGER NOT NULL DEFAULT 0,
        seo_indexable INTEGER NOT NULL DEFAULT 1,
        trust_tier TEXT NOT NULL DEFAULT 'untrusted',
        trust_score INTEGER NOT NULL DEFAULT 0,
        modified_at INTEGER,
        first_seen_at INTEGER,
        rendered_raw TEXT GENERATED ALWAYS AS (forbid_skill_body_read(owner)) VIRTUAL,
        source_resolved INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (owner, repo, name)
      );
      INSERT INTO repos (owner, repo, stars) VALUES
        ('antfu', 'small-repo', 10),
        ('antfu', 'top-repo', 100),
        ('vuejs', 'skills', 50),
        ('gone', 'deleted-repo', 1);
      INSERT INTO skills (owner, repo, name, display_name, slug, like_count, source_resolved) VALUES
        ('antfu', 'small-repo', 'vite', 'Vite', 'antfu/small-repo/vite', 9, 1),
        ('antfu', 'top-repo', 'nuxt', 'Nuxt', 'antfu/top-repo/nuxt', 2, 1),
        ('vuejs', 'skills', 'vue', 'Vue', 'vuejs/skills/vue', 5, 1),
        -- Source deleted upstream: serves a 410 tombstone, listings skip it.
        ('gone', 'deleted-repo', 'ghost', 'Ghost', 'gone/deleted-repo/ghost', 99, 0);
    `)
    forbidSkillBodyRead = true

    try {
      const result = await querySkills(eventFor(sqlite), {
        uniqueOwners: true,
        sort: 'likes',
      } as Parameters<typeof querySkills>[1])

      // `gone/ghost` has the highest like count but its source is unresolved,
      // so it must not win the antfu-free owner browse or appear at all.
      expect(result.total).toBe(2)
      expect(result.items.map(skill => [skill.owner, skill.name, skill.likeCount])).toEqual([
        ['antfu', 'vite', 9],
        ['vuejs', 'vue', 5],
      ])
    }
    finally {
      sqlite.close()
    }
  })
})

function eventFor(sqlite: Database.Database): H3Event {
  return {
    context: {
      platform: {
        db: wrapSqlite(sqlite),
      },
    },
  } as H3Event
}

function wrapSqlite(sqlite: Database.Database): D1Database {
  const prepare = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...next: unknown[]) => prepare(sql, next),
    all: async <T>() => ({
      results: sqlite.prepare(sql).all(...params) as T[],
      success: true,
      meta: {},
    }),
  }) as unknown as D1PreparedStatement

  return {
    prepare,
    batch: async <T>(statements: D1PreparedStatement[]) => await Promise.all(
      statements.map(statement => statement.all<T>()),
    ),
  } as unknown as D1Database
}
