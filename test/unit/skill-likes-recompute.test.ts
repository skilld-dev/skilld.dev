import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * drain-skill-dirty is a scheduled task wrapped in observability helpers, so
 * booting it here would test the wrapper rather than the arithmetic. The
 * counter recompute is one SQL statement; this lifts that exact statement out
 * of the source and runs it, so a formula edit that breaks like_count fails
 * here instead of silently shipping a wrong public number (ADR-0003).
 */
const DRAIN_SOURCE = readFileSync(
  resolve(process.cwd(), 'layers/registry/server/tasks/drain-skill-dirty.ts'),
  'utf8',
)

function recomputeSql(): string {
  const match = DRAIN_SOURCE.match(/`(UPDATE skills[\s\S]*?WHERE owner = \?1 AND repo = \?2 AND name = \?3)`/)
  if (!match?.[1])
    throw new Error('could not locate the counter recompute statement in drain-skill-dirty.ts')
  return match[1].replace(/\?1/g, '?').replace(/\?2/g, '?').replace(/\?3/g, '?')
}

describe('skill_dirty counter recompute', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        curator_count INTEGER NOT NULL DEFAULT 0,
        curator_reason_count INTEGER NOT NULL DEFAULT 0,
        approved_social_count INTEGER NOT NULL DEFAULT 0,
        author_social_count INTEGER NOT NULL DEFAULT 0,
        like_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE skill_likes (
        user_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, owner, repo, name)
      );
      CREATE TABLE collections_v2 (id INTEGER PRIMARY KEY, deleted_at INTEGER);
      CREATE TABLE collection_skills_v2 (
        collection_id INTEGER NOT NULL,
        owner TEXT, repo TEXT, name TEXT, reason TEXT
      );
      CREATE TABLE skill_social_posts (skill_slug TEXT, status TEXT, role TEXT);
      INSERT INTO skills (owner, repo, name, slug) VALUES
        ('nuxt', 'ui', 'design-tokens', 'nuxt/ui/design-tokens'),
        ('nuxt', 'ui', 'motion', 'nuxt/ui/motion');
    `)
  })

  afterEach(() => sqlite.close())

  function drain(owner: string, repo: string, name: string) {
    sqlite.prepare(recomputeSql()).run(owner, repo, name)
  }

  function likeCount(name: string) {
    return sqlite.prepare(`SELECT like_count FROM skills WHERE name = ?`).pluck().get(name)
  }

  it('counts likes at full skill identity, not repo', () => {
    sqlite.exec(`
      INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES
        (1, 'nuxt', 'ui', 'design-tokens', 1),
        (2, 'nuxt', 'ui', 'design-tokens', 1),
        (3, 'nuxt', 'ui', 'motion', 1);
    `)

    drain('nuxt', 'ui', 'design-tokens')
    drain('nuxt', 'ui', 'motion')

    expect(likeCount('design-tokens')).toBe(2)
    expect(likeCount('motion')).toBe(1)
  })

  it('falls back to zero when the last like is removed', () => {
    sqlite.exec(`INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (1, 'nuxt', 'ui', 'motion', 1)`)
    drain('nuxt', 'ui', 'motion')
    expect(likeCount('motion')).toBe(1)

    sqlite.exec(`DELETE FROM skill_likes WHERE name = 'motion'`)
    drain('nuxt', 'ui', 'motion')
    expect(likeCount('motion')).toBe(0)
  })

  it('leaves the other denormalized counters at their recomputed values', () => {
    sqlite.exec(`
      INSERT INTO collections_v2 (id, deleted_at) VALUES (1, NULL);
      INSERT INTO collection_skills_v2 (collection_id, owner, repo, name, reason)
      VALUES (1, 'nuxt', 'ui', 'motion', 'a reason long enough to count');
      INSERT INTO skill_social_posts (skill_slug, status, role)
      VALUES ('nuxt/ui/motion', 'approved', 'author');
    `)

    drain('nuxt', 'ui', 'motion')

    expect(sqlite.prepare(`SELECT curator_count, curator_reason_count, approved_social_count, author_social_count, like_count
      FROM skills WHERE name = 'motion'`).get()).toEqual({
      curator_count: 1,
      curator_reason_count: 1,
      approved_social_count: 1,
      author_social_count: 1,
      like_count: 0,
    })
  })
})
