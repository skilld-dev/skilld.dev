// @vitest-environment node
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadTrendingSkills } from '../../shared/server/trending-skills'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// The GitHub half of this ranking joins `skills` and `repo_star_surges`, which
// different migrations created, so the whole chain is replayed.
const MIGRATIONS = allMigrations()
const NOW = 1_760_000_000
const HOUR = 3600

let harness: SqliteD1 | null = null
function db() {
  harness ??= createSqliteD1(MIGRATIONS)
  return harness
}
afterEach(() => {
  harness?.close()
  harness = null
})

let seq = 0
function mention(input: {
  owner: string
  repo: string
  slug: string
  handle: string
  likes?: number
  bookmarks?: number
  postedAt?: number
  canonical?: string
}) {
  const id = `p${++seq}`
  const postedAt = input.postedAt ?? NOW - HOUR
  db().raw.prepare(
    `INSERT INTO x_posts (
       post_id, author_id, author_handle, author_name, author_followers,
       text_extract, lang, posted_at, first_seen_at,
       favourite_count, repost_count, reply_count, quote_count,
       bookmark_count, impression_count, metrics_updated_at,
       refresh_tier, next_refresh_at
     ) VALUES (?, ?, ?, NULL, 0, ?, 'en', ?, ?, ?, 0, 0, 0, ?, 0, ?, 'hot', ?)`,
  ).run(
    id,
    `a-${input.handle}`,
    input.handle,
    `post about /${input.slug}`,
    postedAt,
    postedAt,
    input.likes ?? 1,
    input.bookmarks ?? 0,
    postedAt,
    postedAt + HOUR,
  )
  db().raw.prepare(
    `INSERT INTO x_post_skills (post_id, owner, repo, slug, canonical_name, skill_path, detection, matched_on, verified_at)
     VALUES (?, ?, ?, ?, ?, 'SKILL.md', 'slash', 'directory', ?)`,
  ).run(id, input.owner, input.repo, input.slug, input.canonical ?? input.slug, NOW)
}

describe('loadTrendingSkills ranking', () => {
  it('ranks by how many separate people named the skill', async () => {
    mention({ owner: 'a', repo: 'r', slug: 'broad', handle: 'p1' })
    mention({ owner: 'a', repo: 'r', slug: 'broad', handle: 'p2' })
    mention({ owner: 'a', repo: 'r', slug: 'broad', handle: 'p3' })
    mention({ owner: 'b', repo: 'r', slug: 'loud', handle: 'q1', likes: 5000 })

    const result = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(result.map(s => s.slug)).toEqual(['broad', 'loud'])
    expect(result[0]?.social?.authorCount).toBe(3)
  })

  it('does not let one person lift a skill by posting repeatedly', async () => {
    for (let i = 0; i < 6; i++)
      mention({ owner: 'a', repo: 'r', slug: 'spammed', handle: 'same' })
    mention({ owner: 'b', repo: 'r', slug: 'real', handle: 'x1' })
    mention({ owner: 'b', repo: 'r', slug: 'real', handle: 'x2' })

    const result = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(result[0]?.slug).toBe('real')
    expect(result.find(s => s.slug === 'spammed')?.social?.authorCount).toBe(1)
  })

  it('breaks ties on engagement, not before it', async () => {
    mention({ owner: 'a', repo: 'r', slug: 'quiet', handle: 'p1', likes: 1 })
    mention({ owner: 'b', repo: 'r', slug: 'popular', handle: 'p2', likes: 900 })

    const result = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(result.map(s => s.slug)).toEqual(['popular', 'quiet'])
  })

  it('surfaces skills beyond the familiar GitHub leaders first', async () => {
    mention({ owner: 'known', repo: 'leader', slug: 'familiar', handle: 'p1', likes: 900 })
    mention({ owner: 'new', repo: 'discovery', slug: 'overlooked', handle: 'p2', likes: 1 })

    const result = await loadTrendingSkills({
      db: db().db,
      now: NOW,
      limit: 1,
      deprioritizeRepositories: new Set(['known/leader']),
    })

    expect(result.map(s => s.slug)).toEqual(['overlooked'])
  })
})

describe('loadTrendingSkills engagement floor', () => {
  it('drops a mention on a post nobody engaged with', async () => {
    mention({ owner: 'a', repo: 'r', slug: 'ignored', handle: 'p1', likes: 0 })

    expect(await loadTrendingSkills({ db: db().db, now: NOW })).toEqual([])
  })

  it('counts an author promoting their own skill when people responded', async () => {
    // Ownership is not held against anyone: a post people react to is signal
    // whoever wrote it.
    mention({ owner: 'joeblau', repo: 'skills', slug: 'sludge', handle: 'joeblau', likes: 40 })

    const result = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(result).toHaveLength(1)
    expect(result[0]?.social?.authorCount).toBe(1)
  })

  it('excludes everything below the requested floor', async () => {
    mention({ owner: 'a', repo: 'r', slug: 'quiet', handle: 'p1', likes: 3 })
    mention({ owner: 'b', repo: 'r', slug: 'busy', handle: 'p2', likes: 60 })

    const result = await loadTrendingSkills({ db: db().db, now: NOW, minLikes: 25 })
    expect(result.map(s => s.slug)).toEqual(['busy'])
  })

  it('admits a zero-like mention when the floor is zero', async () => {
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'p1', likes: 0 })
    const result = await loadTrendingSkills({ db: db().db, now: NOW, minLikes: 0 })
    expect(result).toHaveLength(1)
  })
})

describe('loadTrendingSkills window', () => {
  it('ignores mentions older than the window', async () => {
    mention({ owner: 'a', repo: 'r', slug: 'stale', handle: 'p1', postedAt: NOW - 30 * 24 * HOUR })
    expect(await loadTrendingSkills({ db: db().db, now: NOW })).toEqual([])
  })

  it('narrows to a shorter window on request', async () => {
    mention({ owner: 'a', repo: 'r', slug: 'today', handle: 'p1', postedAt: NOW - 2 * HOUR })
    mention({ owner: 'b', repo: 'r', slug: 'lastweek', handle: 'p2', postedAt: NOW - 5 * 24 * HOUR })

    const week = await loadTrendingSkills({ db: db().db, now: NOW })
    const day = await loadTrendingSkills({ db: db().db, now: NOW, windowHours: 24 })
    expect(week.map(s => s.slug).sort()).toEqual(['lastweek', 'today'])
    expect(day.map(s => s.slug)).toEqual(['today'])
  })
})

describe('loadTrendingSkills presentation', () => {
  it('shows the canonical name while keeping the slug for routing', async () => {
    mention({
      owner: 'danyuchn',
      repo: 'asd-ste100-skill',
      slug: 'asd-ste100-skill',
      canonical: 'asd-ste100',
      handle: 'sanyampunia',
    })

    const [skill] = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(skill?.canonicalName).toBe('asd-ste100')
    expect(skill?.slug).toBe('asd-ste100-skill')
  })

  it('quotes the strongest post as evidence', async () => {
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'quiet', likes: 2 })
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'loud', likes: 400 })

    const [skill] = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(skill?.evidence?.authorHandle).toBe('loud')
    expect(skill?.evidence?.url).toBe(`https://x.com/loud/status/${skill?.evidence?.postId}`)
  })
})
