import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { normalizeSchemaSql } from '../../scripts/lib/d1-schema-verifier'

const migrationsDir = resolve(process.cwd(), 'migrations')
const repairMigration = resolve(migrationsDir, '0073_repair_schema_drift.sql')
const cfJobsUpgradeMigration = resolve(migrationsDir, '0094_cf_jobs_016.sql')

describe('schema drift repair migration', () => {
  it('recreates missing objects while preserving existing rows', () => {
    const sqlite = replayBeforeRepair()
    try {
      sqlite.exec(`
        INSERT INTO repo_trust_overrides (
          owner, repo, tier, source, reason, reviewed_by, reviewed_at
        ) VALUES (
          'acme', 'skills', 'official', 'manual', 'verified', 'ops', 1
        );
        INSERT INTO job_batches (id, total_jobs, pending_jobs, failed_jobs)
        VALUES ('batch-1', 1, 1, 0);
        INSERT INTO jobs (
          id, queue, job_type, batch_id, payload, available_at
        ) VALUES (
          'job-1', 'default', 'sync', 'batch-1', '{}', 1
        );
        INSERT INTO failed_jobs (
          id, queue, job_type, batch_id, payload, exception,
          attempts, max_attempts, failed_at
        ) VALUES (
          'failed-1', 'default', 'sync', 'batch-1', '{}', 'failed',
          3, 3, 1
        );
        DROP TABLE install_events;
        DROP INDEX idx_repo_trust_overrides_tier;
      `)

      const repairSql = readFileSync(repairMigration, 'utf8')
      sqlite.exec(repairSql)
      sqlite.exec(repairSql)
      sqlite.exec(readFileSync(cfJobsUpgradeMigration, 'utf8'))

      const requiredObjects = [
        'install_events',
        'idx_install_events_recent',
        'idx_install_events_skill',
        'idx_install_events_collection',
        'idx_repo_trust_overrides_tier',
        'idx_jobs_dispatchable',
        'idx_jobs_stale_reserved',
        'idx_jobs_active',
        'idx_failed_jobs_site_failed_at',
        'idx_failed_jobs_batch_failed_at',
      ]
      const objects = sqlite.prepare(
        `SELECT name FROM sqlite_master WHERE name IN (${requiredObjects.map(() => '?').join(', ')})`,
      ).all(...requiredObjects) as Array<{ name: string }>
      expect(objects.map(object => object.name).sort()).toEqual([...requiredObjects].sort())
      expect(sqlite.prepare(`SELECT owner, repo FROM repo_trust_overrides`).get())
        .toEqual({ owner: 'acme', repo: 'skills' })
      expect(sqlite.prepare(`SELECT id FROM jobs`).pluck().all()).toEqual(['job-1'])
      expect(sqlite.prepare(`SELECT id FROM failed_jobs`).pluck().all()).toEqual(['failed-1'])
      expect(sqlite.prepare(`PRAGMA foreign_key_check`).all()).toEqual([])

      // Migration 0118 drops install_events, so a full replay has none to compare.
      const clean = replayAll()
      try {
        for (const name of requiredObjects.filter(name => !name.includes('install_events'))) {
          expect(objectSql(sqlite, name)).toBe(objectSql(clean, name))
        }
      }
      finally {
        clean.close()
      }
    }
    finally {
      sqlite.close()
    }
  })

  it('uses the repair indexes for package and install hot paths without scan or sort', () => {
    const sqlite = replayBeforeRepair()
    try {
      sqlite.exec(readFileSync(repairMigration, 'utf8'))
      const plans = {
        dispatchable: explain(sqlite, `
          SELECT * FROM jobs
          WHERE reserved_at IS NULL
            AND available_at <= ?
            AND completed_at IS NULL
            AND failed_at IS NULL
          ORDER BY available_at ASC
          LIMIT ?
        `, [100, 10]),
        staleReserved: explain(sqlite, `
          SELECT * FROM jobs
          WHERE reserved_at IS NOT NULL
            AND reserved_at <= ?
            AND completed_at IS NULL
            AND failed_at IS NULL
          ORDER BY reserved_at ASC
          LIMIT ?
        `, [100, 10]),
        failedBatch: explain(sqlite, `
          SELECT * FROM failed_jobs WHERE batch_id = ?
        `, ['batch-1']),
        installRecent: explain(sqlite, `
          SELECT * FROM install_events
          WHERE occurred_at >= ?
          ORDER BY occurred_at DESC
        `, [1]),
      }

      expect(plans.dispatchable).toContain('idx_jobs_dispatchable')
      expect(plans.staleReserved).toContain('idx_jobs_stale_reserved')
      expect(plans.failedBatch).toContain('idx_failed_jobs_batch')
      expect(plans.installRecent).toContain('idx_install_events_recent')
      for (const plan of Object.values(plans)) {
        expect(plan).not.toContain('SCAN ')
        expect(plan).not.toContain('USE TEMP B-TREE')
      }
    }
    finally {
      sqlite.close()
    }
  })
})

function replayBeforeRepair(): Database.Database {
  const sqlite = new Database(':memory:')
  for (const migration of readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') && file < '0073_repair_schema_drift.sql')
    .sort()) {
    sqlite.exec(readFileSync(resolve(migrationsDir, migration), 'utf8'))
  }
  return sqlite
}

function replayAll(): Database.Database {
  const sqlite = new Database(':memory:')
  for (const migration of readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(resolve(migrationsDir, migration), 'utf8'))
  }
  return sqlite
}

function objectSql(sqlite: Database.Database, name: string): string {
  const row = sqlite.prepare(
    `SELECT sql FROM sqlite_master WHERE name = ?`,
  ).get(name) as { sql: string } | undefined
  if (!row)
    throw new Error(`Missing schema object ${name}`)
  return normalizeSchemaSql(row.sql)
}

function explain(
  sqlite: Database.Database,
  sql: string,
  params: unknown[],
): string {
  return (sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>)
    .map(row => row.detail)
    .join('\n')
}
