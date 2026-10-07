import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadFallbackSkills } from '../../shared/server/trending-fallback'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_760_000_000
const DAY = 86_400

let harness: SqliteD1 | null = null
function db() {
  if (!harness) {
    harness = createSqliteD1(['migrations/0098_repo_star_surges.sql'])
    harness.raw.exec(`
      CREATE TABLE IF NOT EXISTS repos (
        owner TEXT NOT NULL, repo TEXT NOT NULL, stars INTEGER, description TEXT,
        PRIMARY KEY (owner, repo));
      CREATE TABLE IF NOT EXISTS skills (
        owner TEXT, repo TEXT, name TEXT, display_name TEXT,
        description TEXT, source_resolved INTEGER DEFAULT 1);
    `)
  }
  return harness
}
afterEach(() => {
  harness?.close()
  harness = null
})

function seedRepo(owner: string, repo: string, stars: number, skills: string[]) {
  db().raw.prepare(`INSERT OR IGNORE INTO repos (owner, repo, stars) VALUES (?, ?, ?)`).run(owner, repo, stars)
  for (const s of skills) {
    db().raw.prepare(
      `INSERT INTO skills (owner, repo, name, display_name, description, source_resolved) VALUES (?, ?, ?, ?, ?, 1)`,
    ).run(owner, repo, s, s, `about ${s}`)
  }
}

function seedSurge(owner: string, repo: string, gain: number, dayOffset = 0) {
  const day = Math.floor((NOW - dayOffset * DAY) / DAY) * DAY
  db().raw.prepare(
    `INSERT INTO repo_star_surges (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
     VALUES (?, ?, ?, ?, 1, 1000, ?)`,
  ).run(owner, repo, day, gain, NOW)
}

describe('loadFallbackSkills', () => {
  it('returns one skill per repo, not one row per skill', async () => {
    seedRepo('acme', 'many', 5000, ['alpha', 'beta', 'gamma'])

    const result = await loadFallbackSkills({ db: db().db, now: NOW, limit: 10 })
    expect(result).toHaveLength(1)
    expect(result[0]?.repoSkillCount).toBe(3)
    expect(result[0]?.registryPath).toBe('/gh/acme/many/alpha')
  })

  it('returns the repository path for one resolved Skill', async () => {
    seedRepo('acme', 'solo', 5000, ['only'])

    const result = await loadFallbackSkills({ db: db().db, now: NOW, limit: 10 })
    expect(result[0]?.registryPath).toBe('/gh/acme/solo')
  })

  it('picks the same skill every time, so the page does not shuffle', async () => {
    seedRepo('acme', 'many', 5000, ['zulu', 'alpha', 'mike'])

    const first = await loadFallbackSkills({ db: db().db, now: NOW, limit: 10 })
    const second = await loadFallbackSkills({ db: db().db, now: NOW, limit: 10 })
    expect(first[0]?.slug).toBe(second[0]?.slug)
  })

  it('ranks a repo that is surging above a bigger one that is flat', async () => {
    seedRepo('big', 'flat', 90_000, ['a'])
    seedRepo('small', 'climbing', 1200, ['b'])
    seedSurge('small', 'climbing', 800)

    const result = await loadFallbackSkills({ db: db().db, now: NOW, limit: 10 })
    expect(result.map(r => r.repo)).toEqual(['climbing', 'flat'])
    expect(result[0]?.starsGained).toBe(800)
  })

  it('uses repositories beyond the familiar GitHub leaders before them', async () => {
    seedRepo('known', 'leader', 90_000, ['a'])
    seedRepo('new', 'discovery', 120, ['b'])

    const result = await loadFallbackSkills({
      db: db().db,
      now: NOW,
      limit: 1,
      deprioritizeRepositories: new Set(['known/leader']),
    })

    expect(result.map(r => `${r.owner}/${r.repo}`)).toEqual(['new/discovery'])
  })

  it('ignores a surge older than the window', async () => {
    seedRepo('a', 'stale', 1000, ['x'])
    seedSurge('a', 'stale', 900, 30)

    const [row] = await loadFallbackSkills({ db: db().db, now: NOW, limit: 10 })
    expect(row?.starsGained).toBeNull()
  })

  it('never repeats a repo already on the page', async () => {
    seedRepo('acme', 'shown', 9000, ['a'])
    seedRepo('acme', 'fresh', 8000, ['b'])

    const result = await loadFallbackSkills({
      db: db().db,
      now: NOW,
      limit: 10,
      exclude: new Set(['acme/shown']),
    })
    expect(result.map(r => r.repo)).toEqual(['fresh'])
  })

  it('still fills the page when the excluded repos are the most popular', async () => {
    // Over-fetching matters: excluding the top entries must not shorten the page.
    for (let i = 0; i < 8; i++)
      seedRepo('o', `r${i}`, 10_000 - i, [`s${i}`])

    const result = await loadFallbackSkills({
      db: db().db,
      now: NOW,
      limit: 3,
      exclude: new Set(['o/r0', 'o/r1', 'o/r2']),
    })
    expect(result.map(r => r.repo)).toEqual(['r3', 'r4', 'r5'])
  })

  it('excludes repos below the star bar, so filler is still notable', async () => {
    seedRepo('tiny', 'repo', 4, ['a'])
    seedRepo('real', 'repo', 4000, ['b'])

    const result = await loadFallbackSkills({ db: db().db, now: NOW, limit: 10 })
    expect(result.map(r => r.owner)).toEqual(['real'])
  })

  it('ignores repos with no indexed skill, having nothing to point at', async () => {
    db().raw.prepare(`INSERT INTO repos (owner, repo, stars) VALUES ('empty', 'repo', 50000)`).run()

    expect(await loadFallbackSkills({ db: db().db, now: NOW, limit: 10 })).toEqual([])
  })
})
