import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GENERAL_SYNC_CANDIDATES_SQL,
  prioritizeRepoSyncCandidates,
  SUBSCRIBED_SYNC_CANDIDATES_SQL,
} from '../../layers/registry/server/utils/sync-candidates'

describe('github sync candidate selection', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        repo_meta_synced_at INTEGER,
        broken_since INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE skill_subscriptions (
        user_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL
      );
      CREATE INDEX idx_repos_sync_due
        ON repos(repo_meta_synced_at, owner, repo)
        WHERE broken_since IS NULL;

      INSERT INTO repos VALUES
        ('acme', 'watched-due',    995000, NULL),
        ('acme', 'watched-fresh', 999000, NULL),
        ('acme', 'general-recent',992800, NULL),
        ('acme', 'general-due',   850000, NULL),
        ('acme', 'never-checked',   NULL, NULL),
        ('acme', 'broken',        800000, 900000),
        ('acme', 'empty-retired', 800000, NULL);

      INSERT INTO skills VALUES
        ('acme', 'watched-due', 'one'),
        ('acme', 'watched-fresh', 'one'),
        ('acme', 'general-recent', 'one'),
        ('acme', 'general-due', 'one'),
        ('acme', 'never-checked', 'one'),
        ('acme', 'broken', 'one');

      INSERT INTO skill_subscriptions VALUES
        (1, 'acme', 'watched-due'),
        (2, 'acme', 'watched-due'),
        (1, 'acme', 'watched-fresh'),
        (1, 'acme', 'empty-retired');
    `)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('uses the one-hour window only for subscribed repos with live skills', () => {
    const rows = sqlite
      .prepare(SUBSCRIBED_SYNC_CANDIDATES_SQL)
      .all({ 1: 1_000_000 - 3600 }) as Array<{ owner: string, repo: string }>

    expect(rows).toEqual([{ owner: 'acme', repo: 'watched-due', ls: 995000 }])
  })

  it('admits only repos due for the general 36-hour refresh', () => {
    const rows = sqlite
      .prepare(GENERAL_SYNC_CANDIDATES_SQL)
      .all({ 1: 1_000_000 - 36 * 3600 }) as Array<{ owner: string, repo: string }>

    expect(rows.map(row => row.repo)).toEqual(['never-checked', 'general-due'])
    expect(rows.map(row => row.repo)).not.toContain('general-recent')
    expect(rows.map(row => row.repo)).not.toContain('broken')
    expect(rows.map(row => row.repo)).not.toContain('empty-retired')
  })

  it('walks the due-work partial index', () => {
    const plan = sqlite
      .prepare(`EXPLAIN QUERY PLAN ${GENERAL_SYNC_CANDIDATES_SQL}`)
      .all({ 1: 1_000_000 - 36 * 3600 }) as Array<{ detail: string }>

    expect(plan.map(row => row.detail).join('\n')).toContain('idx_repos_sync_due')
  })

  it('keeps subscribed repos first, deduplicates them, and reports overflow', () => {
    const result = prioritizeRepoSyncCandidates(
      [
        { owner: 'acme', repo: 'watched', ls: 1 },
        { owner: 'acme', repo: 'watched', ls: 1 },
      ],
      [
        { owner: 'acme', repo: 'general', ls: 2 },
        { owner: 'acme', repo: 'watched', ls: 1 },
        { owner: 'acme', repo: 'deferred', ls: 3 },
      ],
      2,
    )

    expect(result).toEqual({
      ordered: [
        { owner: 'acme', repo: 'watched' },
        { owner: 'acme', repo: 'general' },
      ],
      deferred: 1,
    })
  })
})
