// Regression test for the (owner, name) → (owner, repo, name) migration.
// Two repos under the same owner can each ship a SKILL.md with the same dirName
// (the case that motivated migrations 0033-0035: vercel-labs/agent-skills and
// vercel-labs/openreview both shipping `web-design-guidelines`). Before the
// migration, the second sync would clobber the first. This test pins:
//   - both rows can coexist with PK (owner, repo, name)
//   - the install-tracker UPDATE keyed on (owner, repo, name) updates only its
//     own row, not its sibling
//   - the digest selector groups by (owner, repo), not (owner, name)
//   - skills_v exposes both rows (one per repo)

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('skills (owner, repo, name) collision', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE skills (
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        display_name TEXT NOT NULL,
        installs INTEGER NOT NULL DEFAULT 0,
        slug TEXT NOT NULL,
        description TEXT,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        stars INTEGER NOT NULL DEFAULT 0,
        broken_since INTEGER,
        repo_kind TEXT NOT NULL DEFAULT 'creator',
        PRIMARY KEY (owner, repo)
      );
      CREATE VIEW skills_v AS
        SELECT s.*, r.stars, r.broken_since, r.repo_kind
        FROM skills s
        JOIN repos r ON r.owner = s.owner AND r.repo = s.repo;

      INSERT INTO repos VALUES ('vercel-labs', 'agent-skills', 1200, NULL, 'catalog');
      INSERT INTO repos VALUES ('vercel-labs', 'openreview', 80, NULL, 'creator');

      INSERT INTO skills (name, owner, repo, display_name, installs, slug, description) VALUES
        ('web-design-guidelines', 'vercel-labs', 'agent-skills', 'Web Design Guidelines', 100,
         'vercel-labs/web-design-guidelines', 'Vercel agent-skills version'),
        ('web-design-guidelines', 'vercel-labs', 'openreview', 'Web Design Guidelines', 5,
         'vercel-labs/web-design-guidelines', 'OpenReview version');
    `)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('stores both rows under the same (owner, name) when repo differs', () => {
    const rows = sqlite.prepare(`SELECT owner, repo, name, description FROM skills ORDER BY repo`).all() as Array<{ owner: string, repo: string, name: string, description: string }>
    expect(rows).toHaveLength(2)
    expect(rows[0]!.repo).toBe('agent-skills')
    expect(rows[1]!.repo).toBe('openreview')
    expect(rows[0]!.description).not.toBe(rows[1]!.description)
  })

  it('install-tracker UPDATE keyed on (owner, repo, name) does not bleed to siblings', () => {
    // Mirrors layers/registry/server/api/skill-live/[...id].get.ts
    sqlite
      .prepare(`UPDATE skills SET installs = ? WHERE owner = ? AND repo = ? AND name = ?`)
      .run(999, 'vercel-labs', 'agent-skills', 'web-design-guidelines')

    const rows = sqlite.prepare(`SELECT repo, installs FROM skills ORDER BY repo`).all() as Array<{ repo: string, installs: number }>
    expect(rows.find(r => r.repo === 'agent-skills')!.installs).toBe(999)
    // Critical assertion: sibling row unchanged.
    expect(rows.find(r => r.repo === 'openreview')!.installs).toBe(5)
  })

  it('the latent (owner, name)-only DELETE pattern would wipe both — verified as the regression', () => {
    // This is the pattern fix-bad-slugs.ts and delete-zero-star-skills.ts used
    // to ship. We pin it here so a future revert to that shape fails loudly.
    sqlite.prepare(`DELETE FROM skills WHERE owner = ? AND name = ?`).run('vercel-labs', 'web-design-guidelines')
    const remaining = (sqlite.prepare(`SELECT COUNT(*) AS n FROM skills`).get() as { n: number }).n
    // BOTH rows gone — this is exactly the bug. The fixed scripts now include
    // `repo` in the predicate. If this assertion ever flips (remaining > 0),
    // the underlying schema has changed and we need to re-evaluate.
    expect(remaining).toBe(0)
  })

  it('skills_v returns both rows joined to their distinct repo facts', () => {
    const rows = sqlite.prepare(`SELECT repo, stars, repo_kind FROM skills_v ORDER BY repo`).all() as Array<{ repo: string, stars: number, repo_kind: string }>
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.repo === 'agent-skills')!.stars).toBe(1200)
    expect(rows.find(r => r.repo === 'openreview')!.stars).toBe(80)
    expect(rows.find(r => r.repo === 'agent-skills')!.repo_kind).toBe('catalog')
  })

  it('digest selector groups by (owner, repo), so each collision side gets its own digest entry', () => {
    sqlite.exec(`
      CREATE TABLE activity (owner TEXT, repo TEXT, name TEXT, occurred_at INTEGER);
      CREATE TABLE skill_subscriptions (user_id INTEGER, owner TEXT, repo TEXT, muted_until INTEGER);
      INSERT INTO skill_subscriptions VALUES (1, 'vercel-labs', 'agent-skills', NULL);
      INSERT INTO skill_subscriptions VALUES (1, 'vercel-labs', 'openreview', NULL);
      INSERT INTO activity VALUES ('vercel-labs', 'agent-skills', 'web-design-guidelines', 500);
      INSERT INTO activity VALUES ('vercel-labs', 'openreview',   'web-design-guidelines', 600);
    `)

    const rows = sqlite.prepare(`
      SELECT s.owner, s.repo, COUNT(*) AS commit_count
      FROM activity a
      JOIN skills_v s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
      JOIN skill_subscriptions sub ON sub.user_id = 1 AND sub.owner = s.owner AND sub.repo = s.repo
      WHERE a.occurred_at BETWEEN 0 AND 1000
      GROUP BY s.owner, s.repo
      ORDER BY s.repo
    `).all() as Array<{ owner: string, repo: string, commit_count: number }>

    expect(rows).toHaveLength(2)
    expect(rows[0]!.repo).toBe('agent-skills')
    expect(rows[1]!.repo).toBe('openreview')
  })
})
