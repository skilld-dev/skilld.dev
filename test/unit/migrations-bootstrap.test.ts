import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

describe('d1 migration bootstrap', () => {
  it('applies the complete migration history to an empty database', () => {
    const sqlite = new Database(':memory:')
    const migrationsDir = resolve(process.cwd(), 'migrations')
    const migrations = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort()

    try {
      for (const migration of migrations) {
        if (migration === '0033_skills_repo_in_key.sql') {
          sqlite.exec(`
            INSERT INTO skills (name, owner, repo, display_name, slug, description)
            VALUES ('migration-check', 'skilld-dev', 'skills', 'Migration Check', 'skilld-dev/migration-check', 'preserved');
          `)
        }
        sqlite.exec(readFileSync(resolve(migrationsDir, migration), 'utf8'))
      }

      const skillColumns = sqlite.prepare('PRAGMA table_info(skills)').all() as Array<{ name: string }>
      const skillColumnNames = skillColumns.map(column => column.name)
      expect(skillColumnNames).toContain('owner_verified')
      expect(skillColumnNames).not.toContain('stars')
      expect(sqlite.prepare(
        `SELECT owner, repo, description FROM skills WHERE name = 'migration-check'`,
      ).get()).toEqual({ owner: 'skilld-dev', repo: 'skills', description: 'preserved' })

      const pendingIndex = sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_ai_ready_pages_indexnow_pending'`,
      ).get()
      expect(pendingIndex).toBeTruthy()

      const cfJobTables = sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name IN ('job_batches', 'jobs', 'failed_jobs')
         ORDER BY name`,
      ).all() as Array<{ name: string }>
      expect(cfJobTables.map(table => table.name)).toEqual(['failed_jobs', 'job_batches', 'jobs'])

      const cfJobClaimIndex = sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_jobs_claimable'`,
      ).get()
      expect(cfJobClaimIndex).toBeTruthy()
      expect(migrations.at(-1)).toBe('0068_cf_jobs.sql')
    }
    finally {
      sqlite.close()
    }
  })
})
