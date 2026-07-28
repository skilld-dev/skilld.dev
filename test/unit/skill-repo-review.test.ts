import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  listSkillRepoReviewQueue,
  recordSkillRepoReview,
  SKILL_REPO_APPROVAL_STUCK_SECONDS,
} from '../../layers/registry/server/utils/skill-repo-review'

describe('skill repository review workflow', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        stars INTEGER NOT NULL DEFAULT 0,
        pushed_at INTEGER,
        repo_skill_count INTEGER NOT NULL DEFAULT 0,
        broken_since INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE owners (
        owner TEXT PRIMARY KEY,
        kind TEXT
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE discovery_candidates (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        outcome TEXT NOT NULL,
        rejection_reason TEXT,
        retry_state TEXT NOT NULL,
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
    `)
    insertOwner('harlan-zw', 'user')
    sqlite.exec(readFileSync(
      resolve(process.cwd(), 'migrations/0080_skill_repo_eligibility.sql'),
      'utf8',
    ))
    db = wrapSqlite(sqlite)
  })

  afterEach(() => sqlite.close())

  it('lists indexed single-skill and multi-skill candidates', async () => {
    insertRepo('candidate', 'skills', 120)
    insertSkill('candidate', 'skills', 'one')
    insertSkill('candidate', 'skills', 'two')

    insertRepo('single', 'skill', 500)
    insertSkill('single', 'skill', 'only')

    insertRepo('organization', 'skills', 1_000, null, 'org')
    insertSkill('organization', 'skills', 'one')
    insertSkill('organization', 'skills', 'two')

    insertRepo('reviewed', 'skills', 90)
    insertSkill('reviewed', 'skills', 'one')
    insertSkill('reviewed', 'skills', 'two')
    insertReview('reviewed', 'skills', 'eligible', 900)

    const result = await listSkillRepoReviewQueue(db, {
      now: 1_000,
      candidateLimit: 50,
      decisionLimit: 20,
    })

    expect(result.candidates).toEqual([
      expect.objectContaining({
        owner: 'single',
        repo: 'skill',
        stars: 500,
        skillCount: 1,
        lane: 'indexed',
      }),
      expect.objectContaining({
        owner: 'candidate',
        repo: 'skills',
        stars: 120,
        skillCount: 2,
        lane: 'indexed',
      }),
    ])
    expect(result.decisions).toEqual([
      expect.objectContaining({
        owner: 'reviewed',
        repo: 'skills',
        status: 'eligible',
      }),
      expect.objectContaining({
        owner: 'harlan-zw',
        repo: 'harlan-agent-kit',
        status: 'eligible',
      }),
    ])
  })

  it('lists individual trust-gated inventories for editorial review', async () => {
    insertRepo('candidate', 'skills', 120, null, 'user', 4)
    sqlite.prepare(`
      INSERT INTO discovery_candidates (
        owner, repo, outcome, rejection_reason, retry_state
      ) VALUES ('candidate', 'skills', 'rejected', 'trust_inputs_insufficient', 'exhausted')
    `).run()

    const result = await listSkillRepoReviewQueue(db, {
      now: 1_000,
      candidateLimit: 50,
      decisionLimit: 20,
    })

    expect(result.candidates).toEqual([
      expect.objectContaining({
        owner: 'candidate',
        repo: 'skills',
        stars: 120,
        skillCount: 4,
        lane: 'trust-gated',
      }),
    ])
  })

  it('records an eligible visible repository with reviewer provenance', async () => {
    insertRepo('candidate', 'skills', 120)
    insertSkill('candidate', 'skills', 'one')

    await expect(recordSkillRepoReview(db, {
      owner: 'candidate',
      repo: 'skills',
      status: 'eligible',
      reason: 'Repository primarily distributes agent skills.',
      reviewedBy: 'reviewer@example.com',
      reviewedAt: 1_000,
    })).resolves.toEqual({ _tag: 'eligible_visible' })

    expect(sqlite.prepare(`
      SELECT status, reason, reviewed_by, reviewed_at
      FROM skill_repo_eligibility
      WHERE owner = 'candidate' AND repo = 'skills'
    `).get()).toEqual({
      status: 'eligible',
      reason: 'Repository primarily distributes agent skills.',
      reviewed_by: 'reviewer@example.com',
      reviewed_at: 1_000,
    })
    expect(sqlite.prepare(`
      SELECT tier, source, reason, reviewed_by, reviewed_at
      FROM repo_trust_overrides
      WHERE owner = 'candidate' AND repo = 'skills'
    `).get()).toEqual({
      tier: 'trusted-curator',
      source: 'leaderboard-review',
      reason: 'Repository primarily distributes agent skills.',
      reviewed_by: 'reviewer@example.com',
      reviewed_at: 1_000,
    })
  })

  it('requests priority sync for an eligible repository without active skills', async () => {
    insertOwner('new-owner', 'user')

    await expect(recordSkillRepoReview(db, {
      owner: 'new-owner',
      repo: 'new-skills',
      status: 'eligible',
      reason: 'Repository primarily distributes agent skills.',
      reviewedBy: 'reviewer@example.com',
      reviewedAt: 1_000,
    })).resolves.toEqual({ _tag: 'eligible_sync_required' })
  })

  it('refuses to approve organization-owned repositories', async () => {
    insertOwner('organization', 'org')

    await expect(recordSkillRepoReview(db, {
      owner: 'organization',
      repo: 'skills',
      status: 'eligible',
      reason: 'Repository distributes reusable generic agent skills.',
      reviewedBy: 'reviewer@example.com',
      reviewedAt: 1_000,
    })).resolves.toEqual({ _tag: 'owner_not_individual' })

    expect(sqlite.prepare(`
      SELECT 1
      FROM skill_repo_eligibility
      WHERE owner = 'organization' AND repo = 'skills'
    `).get()).toBeUndefined()
  })

  it('refuses to approve repositories whose owner identity is unknown', async () => {
    await expect(recordSkillRepoReview(db, {
      owner: 'unknown',
      repo: 'skills',
      status: 'eligible',
      reason: 'Repository distributes reusable generic agent skills.',
      reviewedBy: 'reviewer@example.com',
      reviewedAt: 1_000,
    })).resolves.toEqual({ _tag: 'owner_not_individual' })
  })

  it('records a rejection without requesting sync', async () => {
    insertOwner('product', 'user')
    sqlite.prepare(`
      INSERT INTO repo_trust_overrides (
        owner, repo, tier, source, reason, reviewed_by, reviewed_at
      ) VALUES (
        'product', 'app', 'trusted-curator', 'leaderboard-review',
        'Old approval', 'reviewer@example.com', 900
      )
    `).run()

    await expect(recordSkillRepoReview(db, {
      owner: 'product',
      repo: 'app',
      status: 'rejected',
      reason: 'General product repository with incidental skill files.',
      reviewedBy: 'reviewer@example.com',
      reviewedAt: 1_000,
    })).resolves.toEqual({ _tag: 'rejected' })

    expect(sqlite.prepare(`
      SELECT 1 FROM repo_trust_overrides
      WHERE owner = 'product' AND repo = 'app'
    `).get()).toBeUndefined()
  })

  it('surfaces eligible decisions still invisible after fifteen minutes', async () => {
    const now = 2_000
    insertReview(
      'stuck',
      'skills',
      'eligible',
      now - SKILL_REPO_APPROVAL_STUCK_SECONDS - 1,
    )
    insertReview(
      'fresh',
      'skills',
      'eligible',
      now - SKILL_REPO_APPROVAL_STUCK_SECONDS + 1,
    )
    insertReview(
      'rejected',
      'app',
      'rejected',
      now - SKILL_REPO_APPROVAL_STUCK_SECONDS - 1,
    )

    const result = await listSkillRepoReviewQueue(db, {
      now,
      candidateLimit: 50,
      decisionLimit: 20,
    })

    expect(result.stuckApprovals).toEqual([
      expect.objectContaining({ owner: 'stuck', repo: 'skills' }),
    ])
  })

  function insertRepo(
    owner: string,
    repo: string,
    stars: number,
    brokenSince: number | null = null,
    ownerKind: 'user' | 'org' = 'user',
    repoSkillCount = 0,
  ) {
    insertOwner(owner, ownerKind)
    sqlite.prepare(`
      INSERT INTO repos (owner, repo, stars, repo_skill_count, broken_since)
      VALUES (?, ?, ?, ?, ?)
    `).run(owner, repo, stars, repoSkillCount, brokenSince)
  }

  function insertOwner(owner: string, kind: 'user' | 'org') {
    sqlite.prepare(`
      INSERT OR REPLACE INTO owners (owner, kind)
      VALUES (?, ?)
    `).run(owner, kind)
  }

  function insertSkill(owner: string, repo: string, name: string) {
    sqlite.prepare(`
      INSERT INTO skills (owner, repo, name)
      VALUES (?, ?, ?)
    `).run(owner, repo, name)
  }

  function insertReview(
    owner: string,
    repo: string,
    status: 'eligible' | 'rejected',
    reviewedAt: number,
  ) {
    insertOwner(owner, 'user')
    sqlite.prepare(`
      INSERT INTO skill_repo_eligibility (
        owner, repo, status, reason, reviewed_by, reviewed_at
      ) VALUES (?, ?, ?, 'Test review reason', 'test', ?)
    `).run(owner, repo, status, reviewedAt)
  }
})

function wrapSqlite(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      let values: unknown[] = []
      const statement = {
        executeSync() {
          const result = sqlite.prepare(sql).run(...values)
          return {
            success: true,
            meta: {
              changes: result.changes,
              last_row_id: result.lastInsertRowid,
            },
          } as D1Result<unknown>
        },
        bind(...bindings: unknown[]) {
          values = bindings
          return statement
        },
        async all<T>() {
          return {
            success: true,
            results: sqlite.prepare(sql).all(...values) as T[],
            meta: {},
          }
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...values) as T | undefined) ?? null
        },
        async run() {
          return statement.executeSync()
        },
      }
      return statement
    },
    async batch(statements: BoundStatement[]) {
      const transaction = sqlite.transaction(() => statements.map(statement => statement.executeSync()))
      return transaction()
    },
  } as D1Database
}

interface BoundStatement {
  executeSync: () => D1Result<unknown>
}
