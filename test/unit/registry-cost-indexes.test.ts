import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Nuxt's Vitest environment can expose an http(s) import.meta.url. Resolve from
// the configured project root so this remains a normal filesystem path there.
const migrationPath = resolve(process.cwd(), 'migrations/0066_registry_cost_hot_path_indexes.sql')

describe('registry cost hot-path indexes', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        stars INTEGER NOT NULL DEFAULT 0,
        pushed_at INTEGER,
        repo_meta_synced_at INTEGER,
        broken_since INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        PRIMARY KEY (owner, repo, name)
      );
    `)

    const insertRepo = sqlite.prepare(
      'INSERT INTO repos(owner, repo, stars, pushed_at, repo_meta_synced_at, broken_since) VALUES (?, ?, ?, ?, ?, NULL)',
    )
    const insertSkill = sqlite.prepare(
      'INSERT INTO skills(owner, repo, name, description) VALUES (?, ?, ?, ?)',
    )
    const seed = sqlite.transaction(() => {
      for (let i = 0; i < 2000; i++) {
        const owner = `owner-${i}`
        const repo = `repo-${i}`
        insertRepo.run(owner, repo, i, i, i)
        insertSkill.run(owner, repo, `skill-${i}`, `Skill ${i}`)
      }
    })
    seed()

    const migration = readFileSync(migrationPath, 'utf8')
    sqlite.exec(migration)
    sqlite.exec(migration)
    sqlite.exec('ANALYZE')
  })

  afterEach(() => {
    sqlite.close()
  })

  it('uses the name-leading index for batched public skill lookups', () => {
    const sql = `
      SELECT s.*, r.stars, r.pushed_at
      FROM skills s
      JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
      WHERE s.name IN (?, ?)
        AND r.broken_since IS NULL`
    const plan = sqlite
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all('skill-12', 'skill-1900') as Array<{ detail: string }>

    expect(plan.map(row => row.detail).join('\n')).toContain('idx_skills_name_lookup')
    expect(sqlite.prepare(sql).all('skill-12', 'skill-1900')).toHaveLength(2)
  })
})
