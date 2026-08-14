// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { loadTrendingSkills } from '../../shared/server/trending-skills'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_760_000_000

describe('repository stars on trending skills', () => {
  it('carries the repository star count onto each listed skill', async () => {
    const h = createSqliteD1(allMigrations())
    h.raw.prepare(`INSERT INTO repos (owner, repo, stars) VALUES ('obra','superpowers',266025)`).run()
    h.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path)
       VALUES ('obra','superpowers','brainstorming','brainstorming','brainstorming',1,'brainstorming/SKILL.md')`,
    ).run()
    h.raw.prepare(
      `INSERT INTO repo_star_surges (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
       VALUES ('obra','superpowers', ${Math.floor((NOW - 86400) / 86400) * 86400}, 900, 10, 266025, ${NOW - 86400})`,
    ).run()

    const out = await loadTrendingSkills({ db: h.db, now: NOW })
    expect(out).toHaveLength(1)
    expect(out[0]!.stars).toBe(266025)
    h.close()
  })

  it('leaves stars null when the repository is unknown', async () => {
    const h = createSqliteD1(allMigrations())
    h.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path)
       VALUES ('ghost','repo','x','x','x',1,'x/SKILL.md')`,
    ).run()
    h.raw.prepare(`INSERT INTO repos (owner, repo, stars) VALUES ('ghost','repo',0)`).run()
    h.raw.prepare(
      `INSERT INTO repo_star_surges (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
       VALUES ('ghost','repo', ${Math.floor((NOW - 86400) / 86400) * 86400}, 50, 1, 0, ${NOW - 86400})`,
    ).run()
    const out = await loadTrendingSkills({ db: h.db, now: NOW })
    expect(out[0]!.stars).toBe(0)
    h.close()
  })
})
