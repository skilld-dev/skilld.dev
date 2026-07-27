import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DISCOVERY_SYNC_CANDIDATES_SQL,
  GENERAL_SYNC_CANDIDATES_SQL,
  historicalDiscoveryStageCapacity,
  prioritizeRepoSyncCandidates,
  STAGE_HISTORICAL_DISCOVERY_CANDIDATES_SQL,
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
      CREATE TABLE discovery_candidates (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'historical_inventory',
        first_discovered_at INTEGER NOT NULL DEFAULT 0,
        last_discovered_at INTEGER NOT NULL,
        last_attempted_at INTEGER,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        outcome TEXT NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        last_error TEXT,
        retry_state TEXT NOT NULL,
        next_retry_at INTEGER,
        reconsideration_count INTEGER NOT NULL DEFAULT 0,
        claimed_at INTEGER,
        claim_token TEXT,
        owner_verified INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner, repo)
      );
      CREATE INDEX idx_repos_sync_due
        ON repos(repo_meta_synced_at, owner, repo)
        WHERE broken_since IS NULL;
      CREATE INDEX idx_discovery_candidates_due
        ON discovery_candidates(retry_state, next_retry_at, claimed_at, last_discovered_at, owner, repo);

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

      INSERT INTO discovery_candidates (
        owner, repo, last_discovered_at, retry_state, next_retry_at,
        claimed_at, owner_verified
      ) VALUES
        ('acme', 'candidate-ready', 10, 'ready', NULL, NULL, 1),
        ('acme', 'candidate-due', 20, 'retry_scheduled', 999000, NULL, 0),
        ('acme', 'candidate-fresh', 30, 'retry_scheduled', 1001000, NULL, 0),
        ('acme', 'candidate-stale-claim', 40, 'claimed', NULL, 900000, 0),
        ('acme', 'candidate-active-claim', 50, 'claimed', NULL, 999900, 0),
        ('acme', 'candidate-complete', 60, 'complete', NULL, NULL, 0);
    `)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('uses the one-hour window only for subscribed repos with live skills', () => {
    const rows = sqlite
      .prepare(SUBSCRIBED_SYNC_CANDIDATES_SQL)
      .all({ 1: 1_000_000 - 3600, 2: 250 }) as Array<{ owner: string, repo: string }>

    expect(rows).toEqual([{ owner: 'acme', repo: 'watched-due', ls: 995000, owner_verified: 0 }])
  })

  it('admits only repos due for the general 36-hour refresh', () => {
    const rows = sqlite
      .prepare(GENERAL_SYNC_CANDIDATES_SQL)
      .all({ 1: 1_000_000 - 36 * 3600, 2: 250 }) as Array<{ owner: string, repo: string }>

    expect(rows.map(row => row.repo)).toEqual(['never-checked', 'general-due'])
    expect(rows.map(row => row.repo)).not.toContain('general-recent')
    expect(rows.map(row => row.repo)).not.toContain('broken')
    expect(rows.map(row => row.repo)).not.toContain('empty-retired')
  })

  it('walks the due-work partial index', () => {
    const plan = sqlite
      .prepare(`EXPLAIN QUERY PLAN ${GENERAL_SYNC_CANDIDATES_SQL}`)
      .all({ 1: 1_000_000 - 36 * 3600, 2: 250 }) as Array<{ detail: string }>

    expect(plan.map(row => row.detail).join('\n')).toContain('idx_repos_sync_due')
  })

  it('selects due and stale-claimed discovery candidates without skill rows', () => {
    const rows = sqlite
      .prepare(DISCOVERY_SYNC_CANDIDATES_SQL)
      .all({ 1: 1_000_000, 2: 1_000_000 - 3600, 3: 250 }) as Array<{ repo: string }>

    expect(rows.map(row => row.repo)).toEqual([
      'candidate-ready',
      'candidate-due',
      'candidate-stale-claim',
    ])
  })

  it('uses the discovery due index', () => {
    const plan = sqlite
      .prepare(`EXPLAIN QUERY PLAN ${DISCOVERY_SYNC_CANDIDATES_SQL}`)
      .all({ 1: 1_000_000, 2: 1_000_000 - 3600, 3: 250 }) as Array<{ detail: string }>

    expect(plan.map(row => row.detail).join('\n')).toContain('idx_discovery_candidates_due')
  })

  it('stages bounded historical skill-less repos without reviving broken inventory', () => {
    sqlite.exec(`
      INSERT INTO repos VALUES
        ('archive', 'first', 1, NULL),
        ('archive', 'second', 2, NULL),
        ('archive', 'broken', 3, 4);
    `)

    const result = sqlite
      .prepare(STAGE_HISTORICAL_DISCOVERY_CANDIDATES_SQL)
      .run({ 1: 1_000_000, 2: 2 })

    expect(result.changes).toBe(2)
    expect(sqlite.prepare(`
      SELECT owner, repo, source, first_discovered_at, outcome, retry_state
      FROM discovery_candidates
      WHERE owner = 'archive'
      ORDER BY repo
    `).all()).toEqual([
      {
        owner: 'archive',
        repo: 'first',
        source: 'historical_inventory',
        first_discovered_at: 1_000_000,
        outcome: 'pending',
        retry_state: 'ready',
      },
      {
        owner: 'archive',
        repo: 'second',
        source: 'historical_inventory',
        first_discovered_at: 1_000_000,
        outcome: 'pending',
        retry_state: 'ready',
      },
    ])
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
      [
        { owner: 'acme', repo: 'candidate', ls: 4, owner_verified: 1 },
      ],
      { limit: 2, generalReserve: 0 },
    )

    expect(result).toEqual({
      ordered: [
        { owner: 'acme', repo: 'watched', ownerVerified: false },
        { owner: 'acme', repo: 'candidate', ownerVerified: true },
      ],
      deferred: 2,
    })
  })

  it('reserves general refresh capacity after subscribed candidates', () => {
    const subscribed = [{ owner: 'acme', repo: 'watched', ls: 1 }]
    const discovery = Array.from({ length: 5 }, (_, index) => ({
      owner: 'discovery',
      repo: String(index),
      ls: index,
    }))
    const general = Array.from({ length: 3 }, (_, index) => ({
      owner: 'general',
      repo: String(index),
      ls: index,
    }))

    const result = prioritizeRepoSyncCandidates(
      subscribed,
      general,
      discovery,
      { limit: 6, generalReserve: 2 },
    )

    expect(result.ordered.map(row => `${row.owner}/${row.repo}`)).toEqual([
      'acme/watched',
      'discovery/0',
      'discovery/1',
      'discovery/2',
      'general/0',
      'general/1',
    ])
    expect(result.deferred).toBe(3)
  })

  it('fills unused general reserve with discovery without over-staging', () => {
    const subscribed = [{ owner: 'acme', repo: 'watched', ls: 1 }]
    const general = [{ owner: 'general', repo: 'only', ls: 1 }]
    const discovery = [{ owner: 'discovery', repo: 'existing', ls: 1 }]

    expect(historicalDiscoveryStageCapacity(
      subscribed,
      general,
      discovery,
      { limit: 6, generalReserve: 2, maxHistorical: 250 },
    )).toBe(3)
  })

  it.each([
    [SUBSCRIBED_SYNC_CANDIDATES_SQL, 2],
    [GENERAL_SYNC_CANDIDATES_SQL, 2],
    [DISCOVERY_SYNC_CANDIDATES_SQL, 3],
  ])('bounds candidate query results in SQL', (sql, placeholder) => {
    expect(sql).toContain(`LIMIT ?${placeholder}`)
  })
})
