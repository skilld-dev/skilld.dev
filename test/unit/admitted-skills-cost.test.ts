import { describe, expect, it } from 'vitest'
import { listAdmittedSkills } from '../../layers/registry/server/utils/trending-admission'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

describe('admitted Skill paging cost', () => {
  it('counts all resolved siblings only for repositories on the returned page', async () => {
    const harness = createSqliteD1([])
    const { raw } = harness
    let resolutionReads = 0
    raw.function('tracked_resolution', { deterministic: true }, (_owner: unknown, _repo: unknown, _name: unknown) => {
      resolutionReads++
      return 1
    })
    raw.exec(`
      CREATE TABLE repos (owner TEXT, repo TEXT, stars INTEGER, PRIMARY KEY (owner, repo));
      CREATE TABLE skills (
        owner TEXT, repo TEXT, name TEXT, description TEXT,
        source_resolved INTEGER GENERATED ALWAYS AS (tracked_resolution(owner, repo, name)) VIRTUAL,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE skill_trending_admissions (
        owner TEXT, repo TEXT, name TEXT, first_board TEXT, admitted_at INTEGER,
        PRIMARY KEY (owner, repo, name)
      );
      INSERT INTO repos VALUES ('acme', 'tools', 10);
    `)
    const insertSkill = raw.prepare('INSERT INTO skills (owner, repo, name, description) VALUES (\'acme\', \'tools\', ?, \'Description\')')
    const admit = raw.prepare('INSERT INTO skill_trending_admissions VALUES (\'acme\', \'tools\', ?, \'week\', ?)')
    for (let index = 0; index < 300; index++) {
      const name = `skill-${String(index).padStart(3, '0')}`
      insertSkill.run(name)
      if (index < 65)
        admit.run(name, 1000 + index)
    }
    resolutionReads = 0
    try {
      const result = await listAdmittedSkills(harness.db, {
        board: 'week',
        page: 1,
        indexable: ['skill-000', 'skill-001'].map(name => ({ owner: 'acme', repo: 'tools', name })),
      })
      expect(result).toEqual({
        rows: [
          { owner: 'acme', repo: 'tools', name: 'skill-001', description: 'Description', stars: 10, admitted_at: 1001, repo_skill_count: 300 },
          { owner: 'acme', repo: 'tools', name: 'skill-000', description: 'Description', stars: 10, admitted_at: 1000, repo_skill_count: 300 },
        ],
        total: 2,
      })
      // One eligibility pass and one sibling count suffice for this page.
      // Virtual source metadata makes the database reads observable.
      expect(resolutionReads).toBeLessThanOrEqual(400)
    }
    finally {
      raw.close()
    }
  })

  it('pages tied admissions after filtering and retains full sibling counts', async () => {
    const harness = createSqliteD1(allMigrations())
    const { raw } = harness
    const insertRepo = raw.prepare('INSERT INTO repos (owner, repo, stars) VALUES (?, ?, 10)')
    const insertSkill = raw.prepare(`INSERT INTO skills
      (owner, repo, name, slug, display_name, description, source_resolved)
      VALUES (?, ?, ?, ?, ?, 'Description', ?)`)
    const admit = raw.prepare(`INSERT INTO skill_trending_admissions
      (owner, repo, name, first_board, admitted_at) VALUES (?, ?, ?, ?, ?)`)
    const indexable: Array<{ owner: string, repo: string, name: string }> = []
    const seed = (owner: string, repo: string, name: string, resolved = 1) =>
      insertSkill.run(owner, repo, name, `${owner}/${repo}/${name}`, name, resolved)
    for (let index = 0; index < 55; index++) {
      const owner = `owner-${String(index).padStart(3, '0')}`
      const repo = 'tools'
      const name = 'admitted'
      insertRepo.run(owner, repo)
      seed(owner, repo, name)
      admit.run(owner, repo, name, 'week', 1000)
      indexable.push({ owner, repo, name })
    }
    // These newer rows must not consume page positions.
    insertRepo.run('excluded', 'tools')
    seed('excluded', 'tools', 'not-indexable')
    admit.run('excluded', 'tools', 'not-indexable', 'week', 2000)
    seed('excluded', 'tools', 'unresolved', 0)
    admit.run('excluded', 'tools', 'unresolved', 'week', 2000)
    indexable.push({ owner: 'excluded', repo: 'tools', name: 'unresolved' })
    seed('excluded', 'tools', 'other-board')
    admit.run('excluded', 'tools', 'other-board', 'month', 2000)
    indexable.push({ owner: 'excluded', repo: 'tools', name: 'other-board' })
    // Siblings outside admissions still decide the canonical repository URL.
    seed('owner-050', 'tools', 'unadmitted-sibling')
    seed('owner-050', 'tools', 'unresolved-sibling', 0)
    try {
      const first = await listAdmittedSkills(harness.db, { board: 'week', page: 1, indexable })
      const second = await listAdmittedSkills(harness.db, { board: 'week', page: 2, indexable })
      const empty = await listAdmittedSkills(harness.db, { board: 'week', page: 3, indexable })
      expect(first.rows.map(row => row.owner)).toEqual(indexable.slice(0, 50).map(row => row.owner))
      expect(first.rows.every(row => row.repo_skill_count === 1)).toBe(true)
      expect(first.total).toBe(55)
      expect(second.rows.map(row => row.owner)).toEqual(indexable.slice(50, 55).map(row => row.owner))
      expect(second.rows.map(row => row.repo_skill_count)).toEqual([2, 1, 1, 1, 1])
      expect(second.total).toBe(55)
      expect(empty).toEqual({ rows: [], total: 55 })
    }
    finally {
      harness.close()
    }
  })
})
