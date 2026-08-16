import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { featuredCollectionSkillsSql } from '../../server/utils/homepage-queries'

function queryPlan(sqlite: Database.Database, sql: string, ...bindings: unknown[]): string {
  return sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...bindings)
    .map(row => (row as { detail: string }).detail)
    .join('\n')
}

describe('homepage database hot paths', () => {
  it('reads recent activity in feed order without a temporary sort', () => {
    const sqlite = new Database(':memory:')

    try {
      sqlite.exec(`
        CREATE TABLE activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          name TEXT NOT NULL,
          occurred_at INTEGER NOT NULL,
          sha TEXT NOT NULL
        );
        CREATE INDEX idx_activity_recent ON activity(occurred_at DESC, type);
        CREATE INDEX idx_activity_sync_dedupe ON activity(type, owner, repo, name, sha);
        CREATE TABLE skills (
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          name TEXT NOT NULL,
          display_name TEXT,
          description TEXT,
          slug TEXT,
          sync_status TEXT,
          PRIMARY KEY (owner, repo, name)
        );
        CREATE TABLE repos (
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          stars INTEGER NOT NULL,
          PRIMARY KEY (owner, repo)
        );
      `)

      const migration = readFileSync(
        resolve(process.cwd(), 'migrations/0075_homepage_read_indexes.sql'),
        'utf8',
      )
      sqlite.exec(migration)

      const plan = queryPlan(
        sqlite,
        `SELECT a.owner, a.name, a.occurred_at, a.sha,
                s.display_name, s.repo, s.description, s.slug, s.sync_status
         FROM activity a
         INNER JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
         INNER JOIN repos r ON r.owner = a.owner AND r.repo = a.repo
         WHERE a.type = 'skill_updated' AND r.stars >= 100
         ORDER BY a.occurred_at DESC
         LIMIT ?`,
        60,
      )

      expect(plan).toContain('idx_activity_home_feed')
      expect(plan).not.toContain('USE TEMP B-TREE FOR ORDER BY')
    }
    finally {
      sqlite.close()
    }
  })

  it('constrains featured skill ranking to selected collections', () => {
    const sqlite = new Database(':memory:')

    try {
      sqlite.exec(`
        CREATE TABLE collection_skills_v2 (
          collection_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          reason TEXT,
          name TEXT,
          PRIMARY KEY (collection_id, position)
        );
        CREATE TABLE skills (
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          name TEXT NOT NULL,
          display_name TEXT,
          installs INTEGER NOT NULL,
          modified_at INTEGER,
          trust_tier TEXT NOT NULL,
          source_resolved INTEGER NOT NULL,
          rendered_status TEXT,
          PRIMARY KEY (owner, repo, name)
        );
        CREATE TABLE repos (
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          broken_since INTEGER,
          PRIMARY KEY (owner, repo)
        );
        INSERT INTO collection_skills_v2
          (collection_id, position, owner, repo, reason, name)
        VALUES
          (1, 0, 'acme', 'skills', 'best default', NULL),
          (1, 1, 'acme', 'skills', 'exact', 'named'),
          (2, 0, 'other', 'skills', 'not selected', NULL);
        INSERT INTO repos (owner, repo, broken_since)
        VALUES ('acme', 'skills', NULL), ('other', 'skills', NULL);
        INSERT INTO skills
          (owner, repo, name, display_name, installs, modified_at, trust_tier, source_resolved, rendered_status)
        VALUES
          ('acme', 'skills', 'untrusted', 'Untrusted', 1000, 400, 'candidate', 1, 'ok'),
          ('acme', 'skills', 'top', 'Top', 100, 300, 'official', 1, 'ok'),
          ('acme', 'skills', 'named', 'Named', 5, 100, 'trusted-curator', 1, 'ok'),
          ('other', 'skills', 'unrelated', 'Unrelated', 1000, 200, 'official', 1, 'ok');
      `)

      const sql = featuredCollectionSkillsSql('?')
      const rows = sqlite.prepare(sql).all(1)
      const plan = queryPlan(sqlite, sql, 1)

      expect(rows).toEqual([
        expect.objectContaining({ collection_id: 1, position: 0, name: 'top' }),
        expect.objectContaining({ collection_id: 1, position: 1, name: 'named' }),
      ])
      expect(plan).toMatch(/SEARCH cs USING (?:COVERING )?INDEX sqlite_autoindex_collection_skills_v2_1/)
      expect(plan).not.toMatch(/\bSCAN s\b/)
    }
    finally {
      sqlite.close()
    }
  })
})
