// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { RECENT_UPDATES_SQL } from '../../server/utils/recent-updates-query'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_790_000_000
const WINDOW_START = NOW - 90 * 86400

interface Row {
  owner: string
  repo: string
  name: string
  occurred_at: number
  sha: string
  repo_updated_count: number
  repo_skill_count: number
  change_summary: string | null
}

let h: ReturnType<typeof createSqliteD1>

afterEach(() => h.close())

function seedSkill(owner: string, repo: string, name: string, opts: { official?: number, abstract?: number, stars?: number } = {}) {
  h.raw.prepare(`INSERT OR IGNORE INTO repos (owner, repo, stars) VALUES (?, ?, ?)`).run(owner, repo, opts.stars ?? 500)
  h.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, is_official, is_abstract)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(owner, repo, name, `${owner}/${name}`, name, opts.official ?? 1, opts.abstract ?? 1)
}

function seedUpdate(owner: string, repo: string, name: string, occurredAt: number, sha: string) {
  h.raw.prepare(
    `INSERT INTO activity (type, owner, repo, name, occurred_at, sha, ingested_at) VALUES ('skill_updated', ?, ?, ?, ?, ?, ?)`,
  ).run(owner, repo, name, occurredAt, sha, occurredAt)
}

async function recentUpdates(perRepo = 6, total = 72): Promise<Row[]> {
  const res = await h.db.prepare(RECENT_UPDATES_SQL).bind(WINDOW_START, perRepo, total).all<Row>()
  return res.results ?? []
}

describe('recent updates query', () => {
  it('returns each skill once, at its newest update inside the window', async () => {
    h = createSqliteD1(allMigrations())
    seedSkill('acme', 'skills', 'deploy')
    seedUpdate('acme', 'skills', 'deploy', WINDOW_START - 10, 'outside')
    seedUpdate('acme', 'skills', 'deploy', NOW - 300, 'older')
    seedUpdate('acme', 'skills', 'deploy', NOW - 100, 'newest')
    seedUpdate('acme', 'skills', 'deploy', NOW - 200, 'middle')

    const rows = await recentUpdates()

    expect(rows.map(r => [r.name, r.sha, r.occurred_at])).toEqual([['deploy', 'newest', NOW - 100]])
  })

  it('takes the row written last when two updates share a timestamp', async () => {
    h = createSqliteD1(allMigrations())
    seedSkill('acme', 'skills', 'deploy')
    seedUpdate('acme', 'skills', 'deploy', NOW - 100, 'first-written')
    seedUpdate('acme', 'skills', 'deploy', NOW - 100, 'last-written')

    const rows = await recentUpdates()

    expect(rows.map(r => r.sha)).toEqual(['last-written'])
  })

  it('leaves out unofficial, non-abstract, low-star, and quiet skills', async () => {
    h = createSqliteD1(allMigrations())
    seedSkill('acme', 'skills', 'kept')
    seedSkill('acme', 'skills', 'unofficial', { official: 0 })
    seedSkill('acme', 'skills', 'concrete', { abstract: 0 })
    seedSkill('small', 'skills', 'low-stars', { stars: 99 })
    seedSkill('acme', 'skills', 'quiet')
    for (const name of ['kept', 'unofficial', 'concrete'])
      seedUpdate('acme', 'skills', name, NOW - 100, name)
    seedUpdate('small', 'skills', 'low-stars', NOW - 100, 'low-stars')

    const rows = await recentUpdates()

    expect(rows.map(r => r.name)).toEqual(['kept'])
    expect(rows[0]!.repo_skill_count).toBe(4)
  })

  it('caps rows per repository and counts every updated skill of it', async () => {
    h = createSqliteD1(allMigrations())
    for (const [index, name] of ['a', 'b', 'c'].entries()) {
      seedSkill('acme', 'skills', name)
      seedUpdate('acme', 'skills', name, NOW - index * 10, name)
    }
    seedSkill('solo', 'tool', 'only')
    seedUpdate('solo', 'tool', 'only', NOW - 1000, 'only')

    const rows = await recentUpdates(2)

    expect(rows.map(r => [r.owner, r.name, r.repo_updated_count])).toEqual([
      ['acme', 'a', 3],
      ['acme', 'b', 3],
      ['solo', 'only', 1],
    ])
  })

  it('attaches the commit message of the revision current at the update', async () => {
    h = createSqliteD1(allMigrations())
    seedSkill('acme', 'skills', 'deploy')
    seedUpdate('acme', 'skills', 'deploy', NOW - 100, 'sha-2')
    const revision = h.raw.prepare(
      `INSERT INTO skill_revisions (owner, repo, name, sha, modified_at, message) VALUES ('acme', 'skills', 'deploy', ?, ?, ?)`,
    )
    revision.run('sha-1', NOW - 500, 'first change')
    revision.run('sha-2', NOW - 100, 'second change')
    revision.run('sha-3', NOW - 10, 'after the update')

    const rows = await recentUpdates()

    expect(rows[0]!.change_summary).toBe('second change')
  })
})
