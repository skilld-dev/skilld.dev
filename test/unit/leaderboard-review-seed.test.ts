import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('expanded leaderboard review seed', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE skill_repo_eligibility (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        reviewed_by TEXT NOT NULL,
        reviewed_at INTEGER NOT NULL,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE repo_trust_overrides (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        tier TEXT NOT NULL,
        source TEXT NOT NULL,
        reason TEXT NOT NULL,
        reviewed_by TEXT NOT NULL,
        reviewed_at INTEGER NOT NULL,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE discovery_candidates (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        source TEXT NOT NULL,
        last_discovered_at INTEGER NOT NULL,
        last_attempted_at INTEGER,
        attempt_count INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        rejection_reason TEXT,
        last_error TEXT,
        retry_state TEXT NOT NULL,
        next_retry_at INTEGER,
        reconsideration_count INTEGER NOT NULL,
        claimed_at INTEGER,
        claim_token TEXT,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL
      );
      INSERT INTO discovery_candidates (
        owner, repo, source, last_discovered_at, last_attempted_at,
        attempt_count, outcome, rejection_reason, last_error, retry_state,
        next_retry_at, reconsideration_count, claimed_at, claim_token
      ) VALUES (
        'kepano', 'obsidian-skills', 'github_search', 100, 100,
        5, 'rejected', 'trust_inputs_insufficient', NULL, 'exhausted',
        NULL, 0, NULL, NULL
      );
    `)
    sqlite.exec(readFileSync(
      resolve(process.cwd(), 'migrations/0084_expand_reviewed_skill_repositories.sql'),
      'utf8',
    ))
  })

  afterEach(() => sqlite.close())

  it('records every curated repository with matching trust provenance', () => {
    expect(sqlite.prepare(`
      SELECT COUNT(*) FROM skill_repo_eligibility
    `).pluck().get()).toBe(225)
    expect(sqlite.prepare(`
      SELECT COUNT(*) FROM repo_trust_overrides
      WHERE tier = 'trusted-curator'
        AND source = 'leaderboard-review'
        AND reviewed_by = 'leaderboard-curation-2026-07-28'
    `).pluck().get()).toBe(225)
  })

  it('stages trust-gated inventories for priority sync', () => {
    expect(sqlite.prepare(`
      SELECT COUNT(*) FROM skill_repo_review_sync_outbox
    `).pluck().get()).toBe(1)
    expect(sqlite.prepare(`
      SELECT retry_state, outcome, rejection_reason, reconsideration_count
      FROM discovery_candidates
      WHERE owner = 'kepano' AND repo = 'obsidian-skills'
    `).get()).toEqual({
      retry_state: 'ready',
      outcome: 'pending',
      rejection_reason: null,
      reconsideration_count: 1,
    })
  })

  it('excludes repositories that redirected to organizations, forks, or archives', () => {
    const excluded = sqlite.prepare(`
      SELECT owner || '/' || repo
      FROM skill_repo_eligibility
      WHERE (owner = 'forrestchang' AND repo = 'andrej-karpathy-skills')
         OR (owner = 'hyf0' AND repo = 'vue-skills')
         OR (owner = 'hairyf' AND repo = 'skills')
         OR (owner = 'obra' AND repo = 'superpowers-skills')
    `).pluck().all()

    expect(excluded).toEqual([])
  })
})
