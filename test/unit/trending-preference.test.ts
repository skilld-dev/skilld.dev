// @vitest-environment node
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadTopStarredRepositories } from '../../shared/server/trending-repos'
import { createSqliteD1 } from './helpers/d1-sqlite'

let harness: SqliteD1 | null = null

function db() {
  if (!harness) {
    harness = createSqliteD1([])
    harness.raw.exec(`
      CREATE TABLE repos (owner TEXT, repo TEXT, stars INTEGER);
      CREATE TABLE skills (owner TEXT, repo TEXT, source_resolved INTEGER);
    `)
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
      db().raw.prepare('INSERT INTO repos VALUES (?, ?, ?)').run('owner', `repo-${rank}`, 1000 - rank)
      db().raw.prepare('INSERT INTO skills VALUES (?, ?, 1)').run('owner', `repo-${rank}`)
    }
    db().raw.prepare('INSERT INTO repos VALUES (\'empty\', \'popular\', 100000)').run()

    const result = await loadTopStarredRepositories(db().db, 20)

    expect([...result]).toHaveLength(20)
    expect(result.has('owner/repo-1')).toBe(true)
    expect(result.has('owner/repo-21')).toBe(false)
    expect(result.has('empty/popular')).toBe(false)
  })
})
