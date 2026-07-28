import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SKILLS_LEADERBOARD_COUNT_SQL,
  SKILLS_LEADERBOARD_PAGE_SQL,
  SKILLS_LEADERBOARD_SQL,
} from '../../layers/registry/server/utils/skills-leaderboard'

interface LeaderboardRow {
  owner: string
  repo: string
  stars: number
  skill_count: number
  top_skill_name: string
  top_skill_display_name: string
  top_skill_installs: number
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
      CREATE TABLE owners (
        owner TEXT PRIMARY KEY,
        kind TEXT
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        slug TEXT NOT NULL,
        installs INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner, repo, name)
      );
    `)
    insertOwner('harlan-zw', 'user')
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
      reason: 'Individual creator repository publishing reusable development and product workflow skills.',
      reviewed_by: 'harlan',
    })
  })

  it('returns only reviewed, active repositories owned by individual users', () => {
    insertRepo('harlan-zw', 'harlan-agent-kit', 3)
    insertSkill('harlan-zw', 'harlan-agent-kit', 'nuxt-frontend-design', 120)

    insertRepo('popular', 'unreviewed-skills', 100_000)
    insertSkill('popular', 'unreviewed-skills', 'one')

    insertRepo('acme', 'rejected-skills', 50_000, null, 'org')
    insertSkill('acme', 'rejected-skills', 'one')
    insertEligibility('acme', 'rejected-skills', 'rejected')

    insertRepo('acme', 'broken-skills', 40_000, 1, 'org')
    insertSkill('acme', 'broken-skills', 'one')
    insertEligibility('acme', 'broken-skills', 'eligible')

    insertRepo('acme', 'empty-skills', 30_000, null, 'org')
    insertEligibility('acme', 'empty-skills', 'eligible')

    insertRepo('organization', 'generic-skills', 20_000, null, 'org')
    insertSkill('organization', 'generic-skills', 'one')
    insertEligibility('organization', 'generic-skills', 'eligible')

    expect(sqlite.prepare(SKILLS_LEADERBOARD_SQL).all()).toEqual([
      {
        owner: 'harlan-zw',
        repo: 'harlan-agent-kit',
        stars: 3,
        skill_count: 1,
        pushed_at: null,
        repo_meta_synced_at: null,
        eligibility_reason: 'Individual creator repository publishing reusable development and product workflow skills.',
        reviewed_at: expect.any(Number),
        top_skill_name: 'nuxt-frontend-design',
        top_skill_display_name: 'Nuxt Frontend Design',
        top_skill_installs: 120,
      },
    ])
  })

  it('surfaces the most installed skill from each repository', () => {
    insertRepo('creator', 'generic-skills', 100)
    insertSkill('creator', 'generic-skills', 'less-popular', 20)
    insertSkill('creator', 'generic-skills', 'most-popular', 500)
    insertSkill('creator', 'generic-skills', 'also-less-popular', 100)
    insertEligibility('creator', 'generic-skills', 'eligible')

    const rows = sqlite.prepare(SKILLS_LEADERBOARD_SQL).all() as LeaderboardRow[]

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(expect.objectContaining({
      owner: 'creator',
      repo: 'generic-skills',
      skill_count: 3,
      top_skill_name: 'most-popular',
      top_skill_display_name: 'Most Popular',
      top_skill_installs: 500,
    }))
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

  it('paginates repositories without changing their global rank order', () => {
    for (const [owner, stars] of [['alpha', 40], ['beta', 30], ['gamma', 20], ['zeta', 10]] as const) {
      insertRepo(owner, 'skills', stars)
      insertSkill(owner, 'skills', 'one')
      insertEligibility(owner, 'skills', 'eligible')
    }

    const rows = sqlite.prepare(SKILLS_LEADERBOARD_PAGE_SQL).all(2, 1) as LeaderboardRow[]
    const count = sqlite.prepare(SKILLS_LEADERBOARD_COUNT_SQL).get() as { total: number }

    expect(rows.map(row => `${row.owner}/${row.repo}`)).toEqual([
      'beta/skills',
      'gamma/skills',
    ])
    expect(count.total).toBe(4)
  })

  function insertOwner(owner: string, kind: 'user' | 'org') {
    sqlite.prepare(`
      INSERT OR IGNORE INTO owners (owner, kind)
      VALUES (?, ?)
    `).run(owner, kind)
  }

  function insertRepo(
    owner: string,
    repo: string,
    stars: number,
    brokenSince: number | null = null,
    ownerKind: 'user' | 'org' = 'user',
  ) {
    insertOwner(owner, ownerKind)
    sqlite.prepare(`
      INSERT INTO repos (owner, repo, stars, broken_since)
      VALUES (?, ?, ?, ?)
    `).run(owner, repo, stars, brokenSince)
  }

  function insertSkill(owner: string, repo: string, name: string, installs = 0) {
    sqlite.prepare(`
      INSERT INTO skills (owner, repo, name, display_name, slug, installs)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      owner,
      repo,
      name,
      name.split('-').map(segment =>
        segment.charAt(0).toUpperCase() + segment.slice(1),
      ).join(' '),
      name,
      installs,
    )
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
