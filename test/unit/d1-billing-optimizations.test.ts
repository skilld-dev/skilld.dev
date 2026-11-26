import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { repoStarObservationStatements } from '../../layers/registry/server/utils/repo-history'
import { SUBSCRIBED_SYNC_CANDIDATES_SQL } from '../../layers/registry/server/utils/sync-candidates'
import { X_POST_METRICS_PRUNE_SCAN_SQL } from '../../shared/server/x-refresh'

const migrationsDir = resolve(process.cwd(), 'migrations')

function createMigratedDatabase(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
  for (const file of files)
    sqlite.exec(readFileSync(resolve(migrationsDir, file), 'utf8'))
  return sqlite
}

describe('migration 0162 index and trigger optimizations', () => {
  it('guards skills_au so non-FTS column updates skip skills_fts while FTS column edits still reindex', () => {
    const sqlite = createMigratedDatabase()
    try {
      sqlite.prepare(`
        INSERT INTO skills (owner, repo, name, display_name, slug, description, last_synced_at)
        VALUES ('acme', 'tools', 'linter', 'Linter', 'acme/linter', 'alpha original description', 100)
      `).run()

      expect(
        sqlite.prepare(`SELECT name FROM skills_fts WHERE skills_fts MATCH 'alpha'`).all(),
      ).toEqual([{ name: 'linter' }])

      const beforeTotal = (sqlite.prepare('SELECT total_changes() AS n').get() as { n: number }).n
      sqlite.prepare(`
        UPDATE skills SET last_synced_at = 200, references_count = 3, sync_status = 'ok'
        WHERE owner = 'acme' AND repo = 'tools' AND name = 'linter'
      `).run()
      const afterMetaTotal = (sqlite.prepare('SELECT total_changes() AS n').get() as { n: number }).n

      // Only the skills row itself changed: skills_au did not fire into skills_fts.
      expect(afterMetaTotal - beforeTotal).toBe(1)

      sqlite.prepare(`
        UPDATE skills SET description = 'beta refreshed description'
        WHERE owner = 'acme' AND repo = 'tools' AND name = 'linter'
      `).run()

      expect(
        sqlite.prepare(`SELECT name FROM skills_fts WHERE skills_fts MATCH 'alpha'`).all(),
      ).toEqual([])
      expect(
        sqlite.prepare(`SELECT name FROM skills_fts WHERE skills_fts MATCH 'beta'`).all(),
      ).toEqual([{ name: 'linter' }])
    }
    finally {
      sqlite.close()
    }
  })

  it('keeps indexed query plans after dropping redundant skills and repos indexes', () => {
    const sqlite = createMigratedDatabase()
    try {
      const plan = (sql: string, ...params: unknown[]): string =>
        (sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>)
          .map(row => row.detail)
          .join('\n')

      expect(plan(`SELECT name FROM skills WHERE owner = ?`, 'acme')).toContain('SEARCH skills USING')
      expect(plan(`SELECT name FROM skills WHERE owner = ? AND repo = ?`, 'acme', 'tools')).toContain('SEARCH skills USING')
      expect(plan(`SELECT name FROM skills WHERE owner = ? AND repo = ? AND source_resolved = 1 ORDER BY name`, 'acme', 'tools'))
        .toContain('SEARCH skills USING')
      expect(plan(`SELECT name FROM skills WHERE (owner || '/' || repo || '/' || name) IN ('acme/tools/linter')`))
        .toContain('idx_skills_identity_path')

      const subscribedPlan = plan(SUBSCRIBED_SYNC_CANDIDATES_SQL, { 1: 1_000_000, 2: 50 })
      expect(subscribedPlan).toContain('idx_subs_repo')
      expect(subscribedPlan).toContain('SEARCH r USING INDEX sqlite_autoindex_repos_1')
      expect(subscribedPlan).not.toContain('SCAN r')

      const prunePlan = plan(X_POST_METRICS_PRUNE_SCAN_SQL, { 1: 0, 2: 1_000_000, 3: 500 })
      expect(prunePlan).toContain('idx_x_post_metrics_observed (observed_at>? AND observed_at<?)')
      expect(prunePlan).not.toContain('SCAN')
    }
    finally {
      sqlite.close()
    }
  })

  it('skips rewriting repo_star_observations when today already holds the same star count', async () => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec(`
        CREATE TABLE repo_star_observations (
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          observed_day INTEGER NOT NULL,
          stars INTEGER NOT NULL,
          PRIMARY KEY (owner, repo, observed_day)
        );
      `)
      const db = {
        prepare(sql: string) {
          return {
            bind(...params: unknown[]) {
              return {
                async run() {
                  const res = sqlite.prepare(sql).run(...params)
                  return { meta: { changes: res.changes } }
                },
              }
            },
          }
        },
      } as unknown as D1Database

      const day = 1_783_900_800
      const first = await Promise.all(
        repoStarObservationStatements(db, 'acme', 'skills', 42, day).map(stmt => stmt.run()),
      )
      expect(first[0]?.meta.changes).toBe(1)

      const unchanged = await Promise.all(
        repoStarObservationStatements(db, 'acme', 'skills', 42, day + 3600).map(stmt => stmt.run()),
      )
      expect(unchanged[0]?.meta.changes).toBe(0)

      const updated = await Promise.all(
        repoStarObservationStatements(db, 'acme', 'skills', 43, day + 7200).map(stmt => stmt.run()),
      )
      expect(updated[0]?.meta.changes).toBe(1)
    }
    finally {
      sqlite.close()
    }
  })
})
