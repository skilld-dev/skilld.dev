import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RECONCILE_RENDER_CANDIDATES_SQL } from '../../layers/registry/server/utils/sync-candidates'

describe('reconcile-rendered candidate selection', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        broken_since INTEGER,
        tree_truncated_at INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        rendered_status TEXT,
        rendered_skill_path TEXT,
        rendered_raw_sha256 TEXT,
        last_synced_at INTEGER,
        PRIMARY KEY (owner, repo, name)
      );

      INSERT INTO repos VALUES
        ('acme', 'needs-render', NULL, NULL),
        ('acme', 'too-large', NULL, 900000),
        ('acme', 'broken', 900000, NULL);

      INSERT INTO skills VALUES
        ('acme', 'needs-render', 'one', 'failed', NULL, NULL, 100),
        ('acme', 'too-large', 'one', 'failed', NULL, NULL, 100),
        ('acme', 'broken', 'one', 'failed', NULL, NULL, 100);
    `)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('picks unbroken repos due for render repair, excluding a recorded too-large verdict', () => {
    const rows = sqlite
      .prepare(RECONCILE_RENDER_CANDIDATES_SQL)
      .all({ 1: 1_000_000, 2: 50 }) as Array<{ owner: string, repo: string }>

    // acme/too-large is due on the render clock, so only the verdict keeps it out.
    expect(rows).toEqual([{ owner: 'acme', repo: 'needs-render' }])
  })
})
