import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('migrations/0135_relaunch_classifications.sql', 'utf8')

describe('relaunch classification corrections', () => {
  it('updates matching source revisions and preserves changed sources on replay', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE skills (
        owner TEXT, repo TEXT, name TEXT, current_sha TEXT,
        is_abstract INTEGER, target_package TEXT, abstractness_category TEXT,
        PRIMARY KEY(owner, repo, name)
      );
      CREATE TABLE skill_generated (
        owner TEXT, repo TEXT, name TEXT, kind TEXT, sha TEXT, payload TEXT, generated_at TEXT,
        PRIMARY KEY(owner, repo, name, kind)
      );
      INSERT INTO skills VALUES
        ('austintgriffith', 'ethskills', 'gas', '3274aedac133237168fdc997ac477f7353c57d4a', 1, NULL, 'planning'),
        ('supabase', 'agent-skills', 'supabase-postgres-best-practices', 'new-source', 1, NULL, 'performance');
      INSERT INTO skill_generated VALUES
        ('austintgriffith', 'ethskills', 'gas', 'abstractness', 'old-source', '{}', '2026-01-01');
    `)
    db.exec(migration)
    db.exec(migration)
    expect(db.prepare('SELECT is_abstract, target_package FROM skills WHERE owner=?').get('austintgriffith'))
      .toEqual({ is_abstract: 0, target_package: 'ethereum' })
    expect(db.prepare('SELECT sha, json_extract(payload, \'$.kind\') AS kind FROM skill_generated WHERE owner=?').get('austintgriffith'))
      .toEqual({ sha: '3274aedac133237168fdc997ac477f7353c57d4a', kind: 'package-specific' })
    expect(db.prepare('SELECT is_abstract, target_package FROM skills WHERE owner=?').get('supabase'))
      .toEqual({ is_abstract: 1, target_package: null })
    expect(db.prepare('SELECT COUNT(*) AS count FROM skill_generated WHERE owner=?').get('supabase'))
      .toEqual({ count: 0 })
    db.close()
  })
})
