import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadSurgingRepos, scanStarSurges } from '../../shared/server/star-surge-scan'
import { createSqliteD1 } from './helpers/d1-sqlite'

const DAY = 86_400
const NOW = 1_760_000_000
const TODAY = Math.floor(NOW / DAY) * DAY

let harness: SqliteD1 | null = null

/**
 * The two registry tables this module touches. `repo_star_observations` is
 * declared here rather than replayed from its migration because that migration
 * seeds from `repos`, which would drag in the whole schema.
 */
const FIXTURE = `
  CREATE TABLE repos (
    owner TEXT NOT NULL, repo TEXT NOT NULL, stars INTEGER, description TEXT,
    PRIMARY KEY (owner, repo)
  );
  CREATE TABLE skills (owner TEXT, repo TEXT, name TEXT, source_resolved INTEGER DEFAULT 1);
  CREATE TABLE repo_star_observations (
    owner TEXT NOT NULL, repo TEXT NOT NULL,
    observed_day INTEGER NOT NULL, stars INTEGER NOT NULL,
    PRIMARY KEY (owner, repo, observed_day)
  );
`

function db() {
  if (!harness) {
    harness = createSqliteD1(['migrations/0098_repo_star_surges.sql'])
    harness.raw.exec(FIXTURE)
  }
  return harness
}

afterEach(() => {
  harness?.close()
  harness = null
})

/** Seed a daily star series ending today. */
function seedSeries(owner: string, repo: string, totals: number[]) {
  // repo_star_surges carries a foreign key to repos, exactly as production
  // does, so the parent row has to exist for the insert to be accepted.
  db().raw.prepare(`INSERT OR IGNORE INTO repos (owner, repo, stars) VALUES (?, ?, ?)`).run(owner, repo, totals.at(-1) ?? 0)
  const start = TODAY - (totals.length - 1) * DAY
  for (const [i, stars] of totals.entries()) {
    db().raw.prepare(`INSERT INTO repo_star_observations (owner, repo, observed_day, stars) VALUES (?, ?, ?, ?)`).run(owner, repo, start + i * DAY, stars)
  }
}

function seedSkill(owner: string, repo: string) {
  db().raw.prepare(`INSERT INTO skills (owner, repo, name, source_resolved) VALUES (?, ?, 'demo', 1)`).run(owner, repo)
}

describe('scanStarSurges', () => {
  it('records a repo whose growth jumped', async () => {
    seedSeries('kepano', 'obsidian-skills', [100, 105, 110, 115, 400])

    const summary = await scanStarSurges({ db: db().db, now: NOW })
    expect(summary.surges).toBe(1)
    expect(summary.recorded).toBe(1)

    const row = db().raw.prepare(`SELECT owner, repo, latest_gain, baseline_gain, stars FROM repo_star_surges`).get()
    expect(row).toEqual({
      owner: 'kepano',
      repo: 'obsidian-skills',
      latest_gain: 285,
      baseline_gain: 5,
      stars: 400,
    })
  })

  it('records nothing for a repo growing at its usual pace', async () => {
    seedSeries('steady', 'repo', [100, 110, 120, 130, 140])

    const summary = await scanStarSurges({ db: db().db, now: NOW })
    expect(summary.surges).toBe(0)
    expect(db().raw.prepare(`SELECT COUNT(*) AS n FROM repo_star_surges`).get()).toEqual({ n: 0 })
  })

  it('counts repos it cannot judge yet instead of guessing', async () => {
    seedSeries('new', 'repo', [10, 90])

    const summary = await scanStarSurges({ db: db().db, now: NOW })
    expect(summary.insufficientHistory).toBe(1)
    expect(summary.surges).toBe(0)
  })

  it('separates repos that share an owner', async () => {
    seedSeries('acme', 'quiet', [100, 105, 110, 115, 120])
    seedSeries('acme', 'loud', [100, 105, 110, 115, 500])

    await scanStarSurges({ db: db().db, now: NOW })
    const rows = db().raw.prepare(`SELECT repo FROM repo_star_surges`).all()
    expect(rows).toEqual([{ repo: 'loud' }])
  })

  it('examines every repo, not just the first page of observations', async () => {
    // A flat cap examined the first 5,000 repos of an 11,451-repo registry and
    // skipped the rest. This drives well past one internal page so a repo that
    // lands late in the walk is still judged.
    for (let i = 0; i < 400; i++) {
      const surging = i === 399
      seedSeries(`owner${String(i).padStart(4, '0')}`, 'repo', surging
        ? [100, 105, 110, 115, 800]
        : [100, 105, 110, 115, 120])
    }

    const summary = await scanStarSurges({ db: db().db, now: NOW })
    expect(summary.reposScanned).toBe(400)
    expect(summary.truncated).toBe(false)
    // The surging repo sorts last, so it only appears if the walk finished.
    expect(summary.surges).toBe(1)
    expect(db().raw.prepare(`SELECT owner FROM repo_star_surges`).get())
      .toEqual({ owner: 'owner0399' })
  })

  it('reports truncation instead of silently skipping repos', async () => {
    for (let i = 0; i < 10; i++)
      seedSeries(`owner${i}`, 'repo', [100, 105, 110, 115, 120])

    const summary = await scanStarSurges({ db: db().db, now: NOW, limit: 4 })
    expect(summary.reposScanned).toBe(4)
    expect(summary.truncated).toBe(true)
  })

  it('is idempotent: a second run updates the day rather than duplicating it', async () => {
    seedSeries('kepano', 'obsidian-skills', [100, 105, 110, 115, 400])

    await scanStarSurges({ db: db().db, now: NOW })
    await scanStarSurges({ db: db().db, now: NOW + 60 })

    expect(db().raw.prepare(`SELECT COUNT(*) AS n FROM repo_star_surges`).get()).toEqual({ n: 1 })
  })

  it('does not clear an announcement when the day is re-scanned', async () => {
    seedSeries('kepano', 'obsidian-skills', [100, 105, 110, 115, 400])
    await scanStarSurges({ db: db().db, now: NOW })
    db().raw.prepare(`UPDATE repo_star_surges SET announced_at = ?`).run(NOW)

    await scanStarSurges({ db: db().db, now: NOW + 60 })

    expect(db().raw.prepare(`SELECT announced_at FROM repo_star_surges`).get())
      .toEqual({ announced_at: NOW })
  })
})

describe('loadSurgingRepos', () => {
  it('returns the strongest surges first', async () => {
    seedSeries('a', 'small', [100, 105, 110, 115, 300])
    seedSeries('b', 'big', [100, 105, 110, 115, 900])
    await scanStarSurges({ db: db().db, now: NOW })

    const result = await loadSurgingRepos({ db: db().db, now: NOW })
    expect(result.map(r => r.repo)).toEqual(['big', 'small'])
  })

  it('reports a repo once even when it surged on several days', async () => {
    seedSeries('a', 'climbing', [100, 105, 110, 115, 400])
    await scanStarSurges({ db: db().db, now: NOW })
    // A second surge recorded for the following day.
    db().raw.prepare(
      `INSERT INTO repo_star_surges (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
       VALUES ('a', 'climbing', ?, 500, 5, 900, ?)`,
    ).run(TODAY + DAY, NOW)

    const result = await loadSurgingRepos({ db: db().db, now: NOW + DAY })
    expect(result).toHaveLength(1)
    expect(result[0]?.latestGain).toBe(500)
  })

  it('hides a surging repo with no indexed skills from public surfaces', async () => {
    seedSeries('a', 'indexed', [100, 105, 110, 115, 400])
    seedSeries('b', 'unknown', [100, 105, 110, 115, 900])
    seedSkill('a', 'indexed')
    await scanStarSurges({ db: db().db, now: NOW })

    const publicList = await loadSurgingRepos({ db: db().db, now: NOW, indexedOnly: true })
    expect(publicList.map(r => r.repo)).toEqual(['indexed'])

    const adminList = await loadSurgingRepos({ db: db().db, now: NOW })
    expect(adminList).toHaveLength(2)
  })

  it('ignores surges older than the requested window', async () => {
    seedSeries('a', 'stale', [100, 105, 110, 115, 400])
    await scanStarSurges({ db: db().db, now: NOW })

    const result = await loadSurgingRepos({ db: db().db, now: NOW + 30 * DAY, days: 3 })
    expect(result).toEqual([])
  })
})
