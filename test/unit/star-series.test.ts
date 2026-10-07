import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadStarSeries, starSeriesKey } from '../../shared/server/star-series'
import { createSqliteD1 } from './helpers/d1-sqlite'

const DAY = 86_400
const START = 1_759_968_000

let harness: SqliteD1 | null = null
function db() {
  if (!harness) {
    harness = createSqliteD1([])
    harness.raw.exec(`
      CREATE TABLE repo_star_observations (
        owner TEXT NOT NULL, repo TEXT NOT NULL,
        observed_day INTEGER NOT NULL, stars INTEGER NOT NULL,
        PRIMARY KEY (owner, repo, observed_day)
      );
    `)
  }
  return harness
}
afterEach(() => {
  harness?.close()
  harness = null
})

function observe(owner: string, repo: string, day: number, stars: number) {
  db().raw.prepare(`INSERT INTO repo_star_observations (owner, repo, observed_day, stars) VALUES (?, ?, ?, ?)`).run(owner, repo, day, stars)
}

describe('loadStarSeries', () => {
  it('returns each repository from the cutoff day, oldest first', async () => {
    observe('a', 'one', START - DAY, 90)
    observe('a', 'one', START + DAY, 120)
    observe('a', 'one', START, 100)
    observe('b', 'two', START, 7)

    const series = await loadStarSeries(db().db, [{ owner: 'a', repo: 'one' }, { owner: 'b', repo: 'two' }], START)
    expect(series.get('a/one')).toEqual([{ day: START, stars: 100 }, { day: START + DAY, stars: 120 }])
    expect(series.get('b/two')).toEqual([{ day: START, stars: 7 }])
  })

  it('finds a repository stored in mixed case', async () => {
    // Observations share their case with `repos`, which keeps GitHub's.
    observe('TypeSafe-AI', 'Skills', START, 2475)

    const series = await loadStarSeries(db().db, [{ owner: 'TypeSafe-AI', repo: 'Skills' }], START)
    expect(series.get(starSeriesKey('TypeSafe-AI', 'Skills'))).toEqual([{ day: START, stars: 2475 }])
  })

  it('reads a board wider than one statement can bind', async () => {
    const repos = Array.from({ length: 60 }, (_, i) => ({ owner: 'o', repo: `r${i}` }))
    for (const { owner, repo } of repos)
      observe(owner, repo, START, 1)

    const series = await loadStarSeries(db().db, repos, START)
    expect(series.size).toBe(60)
  })

  it('returns nothing for a repository with no observations', async () => {
    expect((await loadStarSeries(db().db, [{ owner: 'x', repo: 'y' }], START)).size).toBe(0)
  })
})
