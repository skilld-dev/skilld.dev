import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SKILLS_LEADERBOARD_SQL } from '../../layers/registry/server/utils/skills-leaderboard'

interface LeaderboardRow {
  owner: string
  repo: string
  stars: number
  skill_count: number
}

describe('skills leaderboard eligibility', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        stars INTEGER NOT NULL DEFAULT 0,
        pushed_at INTEGER,
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
    `)
    sqlite.exec(readFileSync(
      resolve(process.cwd(), 'migrations/0080_skill_repo_eligibility.sql'),
      'utf8',
    ))
  })

  afterEach(() => sqlite.close())

  it('seeds harlan-agent-kit with review provenance', () => {
    expect(sqlite.prepare(`
      SELECT owner, repo, status, reason, reviewed_by
      FROM skill_repo_eligibility
      WHERE owner = 'harlan-zw' AND repo = 'harlan-agent-kit'
    `).get()).toEqual({
      owner: 'harlan-zw',
      repo: 'harlan-agent-kit',
      status: 'eligible',
      reason: 'Repository is dedicated to distributing agent skills and plugin metadata.',
      reviewed_by: 'harlan',
    })
  })

  it('returns only reviewed, active repositories containing skills', () => {
    insertRepo('harlan-zw', 'harlan-agent-kit', 3)
    insertSkill('harlan-zw', 'harlan-agent-kit', 'nuxt-frontend-design')

    insertRepo('popular', 'unreviewed-skills', 100_000)
    insertSkill('popular', 'unreviewed-skills', 'one')

    insertRepo('acme', 'rejected-skills', 50_000)
    insertSkill('acme', 'rejected-skills', 'one')
    insertEligibility('acme', 'rejected-skills', 'rejected')

    insertRepo('acme', 'broken-skills', 40_000, 1)
    insertSkill('acme', 'broken-skills', 'one')
    insertEligibility('acme', 'broken-skills', 'eligible')

    insertRepo('acme', 'empty-skills', 30_000)
    insertEligibility('acme', 'empty-skills', 'eligible')

    expect(sqlite.prepare(SKILLS_LEADERBOARD_SQL).all()).toEqual([
      {
        owner: 'harlan-zw',
        repo: 'harlan-agent-kit',
        stars: 3,
        skill_count: 1,
        pushed_at: null,
        repo_meta_synced_at: null,
        eligibility_reason: 'Repository is dedicated to distributing agent skills and plugin metadata.',
        reviewed_at: expect.any(Number),
      },
    ])
  })

  it('ranks by stars with a stable lexical tie-break', () => {
    insertRepo('zeta', 'skills', 20)
    insertSkill('zeta', 'skills', 'one')
    insertEligibility('zeta', 'skills', 'eligible')

    insertRepo('alpha', 'skills', 20)
    insertSkill('alpha', 'skills', 'one')
    insertEligibility('alpha', 'skills', 'eligible')

    insertRepo('beta', 'skills', 30)
    insertSkill('beta', 'skills', 'one')
    insertEligibility('beta', 'skills', 'eligible')

    const rows = sqlite.prepare(SKILLS_LEADERBOARD_SQL).all() as LeaderboardRow[]
    expect(rows.map(row => `${row.owner}/${row.repo}`)).toEqual([
      'beta/skills',
      'alpha/skills',
      'zeta/skills',
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

  function insertEligibility(
    owner: string,
    repo: string,
    status: 'eligible' | 'rejected',
  ) {
    sqlite.prepare(`
      INSERT INTO skill_repo_eligibility (
        owner, repo, status, reason, reviewed_by
      ) VALUES (?, ?, ?, 'Test decision', 'test')
    `).run(owner, repo, status)
  }
})
