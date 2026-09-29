// @vitest-environment node
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadTopStarredRepositories } from '../../shared/server/trending-repos'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

let harness: SqliteD1 | null = null

function db() {
  if (!harness) {
    // The real schema: the query names `repos_stars_idx` with `INDEXED BY`.
    harness = createSqliteD1(allMigrations())
  }
  return harness
}

afterEach(() => {
  harness?.close()
  harness = null
})

describe('trending discovery preference', () => {
  it('identifies the most-starred repositories that have indexed skills', async () => {
    for (let rank = 1; rank <= 22; rank++) {
      db().raw.prepare('INSERT INTO repos (owner, repo, stars) VALUES (?, ?, ?)').run('owner', `repo-${rank}`, 1000 - rank)
      db().raw.prepare('INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved) VALUES (?, ?, \'s\', \'s\', \'s\', 1)').run('owner', `repo-${rank}`)
    }
    db().raw.prepare('INSERT INTO repos (owner, repo, stars) VALUES (\'empty\', \'popular\', 100000)').run()
    db().raw.prepare('INSERT INTO repos (owner, repo, stars) VALUES (\'unresolved\', \'popular\', 90000)').run()
    db().raw.prepare('INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved) VALUES (\'unresolved\', \'popular\', \'s\', \'s\', \'s\', 0)').run()

    const result = await loadTopStarredRepositories(db().db, 20)

    expect([...result]).toHaveLength(20)
    expect(result.has('owner/repo-1')).toBe(true)
    expect(result.has('owner/repo-21')).toBe(false)
    expect(result.has('empty/popular')).toBe(false)
    expect(result.has('unresolved/popular')).toBe(false)
  })
})
