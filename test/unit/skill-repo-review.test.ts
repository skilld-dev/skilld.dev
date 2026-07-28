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
        broken_since INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (owner, repo, name)
      );
    `)
    sqlite.exec(readFileSync(
      resolve(process.cwd(), 'migrations/0080_skill_repo_eligibility.sql'),
      'utf8',
    ))
    db = wrapSqlite(sqlite)
  })

  afterEach(() => sqlite.close())

  it('lists multi-skill candidates and keeps recent decisions separate', async () => {
    insertRepo('candidate', 'skills', 120)
    insertSkill('candidate', 'skills', 'one')
    insertSkill('candidate', 'skills', 'two')

    insertRepo('single', 'skill', 500)
    insertSkill('single', 'skill', 'only')

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
        owner: 'candidate',
        repo: 'skills',
        stars: 120,
        skillCount: 2,
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
  })

  it('requests priority sync for an eligible repository without active skills', async () => {
    await expect(recordSkillRepoReview(db, {
      owner: 'new-owner',
      repo: 'new-skills',
      status: 'eligible',
      reason: 'Repository primarily distributes agent skills.',
      reviewedBy: 'reviewer@example.com',
      reviewedAt: 1_000,
    })).resolves.toEqual({ _tag: 'eligible_sync_required' })
  })

  it('records a rejection without requesting sync', async () => {
    await expect(recordSkillRepoReview(db, {
      owner: 'product',
      repo: 'app',
      status: 'rejected',
      reason: 'General product repository with incidental skill files.',
      reviewedBy: 'reviewer@example.com',
      reviewedAt: 1_000,
    })).resolves.toEqual({ _tag: 'rejected' })
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

  function insertRepo(owner: string, repo: string, stars: number, brokenSince: number | null = null) {
    sqlite.prepare(`
      INSERT INTO repos (owner, repo, stars, broken_since)
      VALUES (?, ?, ?, ?)
    `).run(owner, repo, stars, brokenSince)
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
          const result = sqlite.prepare(sql).run(...values)
          return {
            success: true,
            meta: {
              changes: result.changes,
              last_row_id: result.lastInsertRowid,
            },
          }
        },
      }
      return statement
    },
  } as D1Database
}
