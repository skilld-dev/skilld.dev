import type { SqliteD1 } from './helpers/d1-sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { moveRepository } from '../../layers/registry/server/utils/repository-move'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const migration = 'migrations/0150_skill_description_history.sql'
let fixture: SqliteD1

beforeEach(() => {
  fixture = createSqliteD1(allMigrations())
})
afterEach(() => fixture.close())

async function snapshot(frontmatter: Record<string, unknown>, hash = 'a'.repeat(64), observedAt = 100) {
  await fixture.db.prepare(`
    INSERT INTO skills(owner,repo,name,display_name,slug,description,current_sha,
      rendered_status,rendered_raw_sha256,rendered_frontmatter,rendered_at,
      rendered_skill_path,rendered_commit_sha)
    VALUES ('author','skills','review','Review','author/review','Repository fallback',
      'blob','ok',?,?,?,'skills/review/SKILL.md',?)
    ON CONFLICT(owner,repo,name) DO UPDATE SET
      rendered_raw_sha256=excluded.rendered_raw_sha256,
      rendered_frontmatter=excluded.rendered_frontmatter,
      rendered_at=excluded.rendered_at,
      rendered_commit_sha=excluded.rendered_commit_sha
  `).bind(hash, JSON.stringify(frontmatter), observedAt, 'c'.repeat(40)).run()
}

function history() {
  return fixture.db.prepare(`SELECT frontmatter,first_observed_at,last_observed_at
    FROM skill_description_history ORDER BY first_observed_at`).all()
}

describe('description history at the snapshot boundary', () => {
  it('preserves the author description when a later snapshot replaces it', async () => {
    await snapshot({ 'description': 'Review changes. Use when reviewing.', 'disable-model-invocation': true })
    await snapshot({ description: 'Review code.' }, 'b'.repeat(64), 200)
    await snapshot({ description: 'Review code.' }, 'b'.repeat(64), 300)
    expect((await history()).results).toEqual([
      { frontmatter: JSON.stringify({ 'description': 'Review changes. Use when reviewing.', 'disable-model-invocation': true }), first_observed_at: 100, last_observed_at: 100 },
      { frontmatter: JSON.stringify({ description: 'Review code.' }), first_observed_at: 200, last_observed_at: 300 },
    ])
  })

  it('records missing descriptions without substituting repository text', async () => {
    await snapshot({ name: 'review' })
    expect((await history()).results).toEqual([
      { frontmatter: '{"name":"review"}', first_observed_at: 100, last_observed_at: 100 },
    ])
  })

  it('ignores incomplete snapshots and preserves history after source removal', async () => {
    await snapshot({ description: 'Original' })
    await fixture.db.prepare(`UPDATE skills SET rendered_status='unavailable',
      rendered_raw_sha256=?, rendered_frontmatter=?, rendered_at=200`).bind('b'.repeat(64), '{"description":"Partial"}').run()
    await fixture.db.prepare('DELETE FROM skills').run()
    expect((await history()).results).toEqual([
      { frontmatter: '{"description":"Original"}', first_observed_at: 100, last_observed_at: 100 },
    ])
  })

  it('moves historical descriptions with the repository identity', async () => {
    await fixture.db.prepare(`INSERT INTO repos(owner,repo,repository_id) VALUES ('author','skills',123)`).run()
    await snapshot({ description: 'Original' })
    await moveRepository(fixture.db, {
      from: { owner: 'author', repo: 'skills' },
      to: { owner: 'author', repo: 'renamed' },
      source: { owner: 'author', repo: 'renamed' },
      repositoryId: 123,
      movedAt: 200,
    })
    expect((await fixture.db.prepare('SELECT owner,repo,name FROM skill_description_history').all()).results)
      .toEqual([{ owner: 'author', repo: 'renamed', name: 'review' }])
  })

  it('backfills only complete stored snapshots', async () => {
    fixture.close()
    fixture = createSqliteD1(allMigrations().filter(path => path !== migration))
    await snapshot({ description: 'Stored original' })
    fixture.raw.exec(readFileSync(migration, 'utf8'))
    expect((await history()).results).toEqual([
      { frontmatter: '{"description":"Stored original"}', first_observed_at: 100, last_observed_at: 100 },
    ])
  })
})
