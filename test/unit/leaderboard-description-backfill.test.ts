import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('leaderboard repository description backfill', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE owners (
        owner TEXT PRIMARY KEY,
        kind TEXT
      );
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        broken_since INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE skill_repo_eligibility (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skill_repo_review_sync_outbox (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        queued_at INTEGER NOT NULL,
        PRIMARY KEY (owner, repo)
      );
      INSERT INTO owners VALUES
        ('creator', 'user'),
        ('organization', 'org');
      INSERT INTO repos VALUES
        ('creator', 'public-skills', NULL),
        ('creator', 'broken-skills', 1),
        ('creator', 'empty-skills', NULL),
        ('organization', 'org-skills', NULL);
      INSERT INTO skills VALUES
        ('creator', 'public-skills', 'one'),
        ('creator', 'broken-skills', 'one'),
        ('organization', 'org-skills', 'one');
      INSERT INTO skill_repo_eligibility VALUES
        ('creator', 'public-skills', 'eligible'),
        ('creator', 'broken-skills', 'eligible'),
        ('creator', 'empty-skills', 'eligible'),
        ('organization', 'org-skills', 'eligible');
    `)
    sqlite.exec(readFileSync(
      resolve(process.cwd(), 'migrations/0085_repo_descriptions.sql'),
      'utf8',
    ))
  })

  afterEach(() => sqlite.close())

  it('queues only public leaderboard repositories without discovery claims', () => {
    expect(sqlite.prepare(`
      SELECT owner, repo, claim_discovery
      FROM skill_repo_review_sync_outbox
    `).all()).toEqual([{
      owner: 'creator',
      repo: 'public-skills',
      claim_discovery: 0,
    }])
  })

  it('adds nullable repository descriptions', () => {
    expect(sqlite.prepare(`PRAGMA table_info(repos)`).all()
      .map(column => (column as { name: string }).name))
      .toContain('description')
  })
})
