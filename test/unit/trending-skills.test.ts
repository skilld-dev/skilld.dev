// @vitest-environment node
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadTrendingSkills, MAX_MORE_POSTS } from '../../shared/server/trending-skills'
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
  avatar?: string
  name?: string
}): string {
  db().raw.prepare(
    `INSERT OR IGNORE INTO repos (owner, repo) VALUES (?, ?)`,
  ).run(input.owner, input.repo)
  db().raw.prepare(
    `INSERT OR IGNORE INTO skills
       (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  ).run(input.owner, input.repo, input.slug, input.slug, input.canonical ?? input.slug, `${input.slug}/SKILL.md`)

  const id = `p${++seq}`
  const postedAt = input.postedAt ?? NOW - HOUR
  db().raw.prepare(
    `INSERT INTO x_posts (
       post_id, author_id, author_handle, author_name, author_followers,
       text_extract, lang, posted_at, first_seen_at,
       favourite_count, repost_count, reply_count, quote_count,
       bookmark_count, impression_count, metrics_updated_at,
       refresh_tier, next_refresh_at, author_avatar
     ) VALUES (?, ?, ?, ?, 0, ?, 'en', ?, ?, ?, 0, 0, 0, ?, 0, ?, 'hot', ?, ?)`,
  ).run(
    id,
    `a-${input.handle}`,
    input.handle,
    input.name ?? null,
    `post about /${input.slug}`,
    postedAt,
    postedAt,
    input.likes ?? 1,
    input.bookmarks ?? 0,
    postedAt,
    postedAt + HOUR,
    input.avatar ?? null,
  )
  db().raw.prepare(
    `INSERT INTO x_post_skills (post_id, owner, repo, slug, canonical_name, skill_path, detection, matched_on, verified_at)
     VALUES (?, ?, ?, ?, ?, 'SKILL.md', 'slash', 'directory', ?)`,
  ).run(id, input.owner, input.repo, input.slug, input.canonical ?? input.slug, NOW)
  return id
}

/** Make an existing post name a second skill too, which is what a listicle does. */
function nameAlso(postId: string, skill: { owner: string, repo: string, slug: string }) {
  db().raw.prepare(`INSERT OR IGNORE INTO repos (owner, repo) VALUES (?, ?)`).run(skill.owner, skill.repo)
  db().raw.prepare(
    `INSERT OR IGNORE INTO skills
       (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  ).run(skill.owner, skill.repo, skill.slug, skill.slug, skill.slug, `${skill.slug}/SKILL.md`)
  db().raw.prepare(
    `INSERT INTO x_post_skills (post_id, owner, repo, slug, canonical_name, skill_path, detection, matched_on, verified_at)
     VALUES (?, ?, ?, ?, ?, 'SKILL.md', 'slash', 'directory', ?)`,
  ).run(postId, skill.owner, skill.repo, skill.slug, skill.slug, NOW)
}

describe('loadTrendingSkills ranking', () => {
  it('does not publish verified mentions before the Skill is indexed', async () => {
    mention({ owner: 'pending', repo: 'repo', slug: 'not-indexed', handle: 'p1', likes: 50 })
    db().raw.prepare(
      `DELETE FROM skills WHERE owner = ? AND repo = ? AND name = ?`,
    ).run('pending', 'repo', 'not-indexed')

    expect(await loadTrendingSkills({ db: db().db, now: NOW })).toEqual([])
  })

  it('ranks by how many separate people named the skill, at comparable reach', async () => {
    mention({ owner: 'a', repo: 'r', slug: 'broad', handle: 'p1', likes: 50 })
    mention({ owner: 'a', repo: 'r', slug: 'broad', handle: 'p2', likes: 50 })
    mention({ owner: 'a', repo: 'r', slug: 'broad', handle: 'p3', likes: 50 })
    mention({ owner: 'b', repo: 'r', slug: 'narrow', handle: 'q1', likes: 50 })

    const result = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(result.map(s => s.slug)).toEqual(['broad', 'narrow'])
    expect(result[0]?.social?.authorCount).toBe(3)
  })

  it('ranks a genuinely viral mention above a few quiet ones', async () => {
    // Reach no longer saturates below one author. Production served the
    // inverse on 2026-08-15: a skill four people named to zero engagement led
    // the board, and one carrying 6,685 engagement sat sixth.
    mention({ owner: 'a', repo: 'r', slug: 'quiet', handle: 'p1', likes: 2 })
    mention({ owner: 'a', repo: 'r', slug: 'quiet', handle: 'p2', likes: 2 })
    mention({ owner: 'b', repo: 'r', slug: 'viral', handle: 'q1', likes: 5000 })

    const result = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(result.map(s => s.slug)).toEqual(['viral', 'quiet'])
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
  it('returns the canonical path with the Skill identity', async () => {
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
    expect(skill?.registryPath).toBe('/gh/danyuchn/asd-ste100-skill')
  })

  it('quotes the strongest post as evidence', async () => {
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'quiet', likes: 2 })
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'loud', likes: 400 })

    const [skill] = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(skill?.evidence?.authorHandle).toBe('loud')
    expect(skill?.evidence?.url).toBe(`https://x.com/loud/status/${skill?.evidence?.postId}`)

    expect(skill?.evidence?.authorAvatar).toBeNull()
  })

  it('carries the quoted author avatar with the evidence', async () => {
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'faceless', likes: 2 })
    mention({
      owner: 'a',
      repo: 'r',
      slug: 's',
      handle: 'faced',
      likes: 50,
      avatar: 'https://pbs.twimg.com/profile_images/1/faced_normal.jpg',
    })

    const [skill] = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(skill?.evidence?.authorHandle).toBe('faced')
    expect(skill?.evidence?.authorAvatar).toBe('https://pbs.twimg.com/profile_images/1/faced_normal.jpg')
  })
})

describe('loadTrendingSkills posts beyond the quote', () => {
  it('carries one post per other author and never repeats the quoted one', async () => {
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'quoted', likes: 90, name: 'Quoted Dev' })
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'quoted', likes: 5 })
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'second', likes: 40 })
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'third', likes: 10 })

    const [skill] = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(skill?.evidence?.authorHandle).toBe('quoted')
    expect(skill?.evidence?.authorName).toBe('Quoted Dev')
    expect(skill?.morePosts.map(post => post.authorHandle)).toEqual(['second', 'third'])
  })

  it('puts a dedicated post before a listicle that outscored it', async () => {
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'quoted', likes: 90 })
    const listicle = mention({ owner: 'a', repo: 'r', slug: 's', handle: 'lister', likes: 500 })
    nameAlso(listicle, { owner: 'b', repo: 'r', slug: 'other' })
    mention({ owner: 'a', repo: 'r', slug: 's', handle: 'fan', likes: 3 })

    const skill = (await loadTrendingSkills({ db: db().db, now: NOW })).find(entry => entry.slug === 's')
    expect(skill?.evidence?.authorHandle).toBe('quoted')
    expect(skill?.morePosts.map(post => post.authorHandle)).toEqual(['fan', 'lister'])
  })

  it('stops at the cap however many devs posted', async () => {
    for (let i = 0; i < MAX_MORE_POSTS + 3; i++)
      mention({ owner: 'a', repo: 'r', slug: 's', handle: `dev${i}`, likes: 100 - i })

    const [skill] = await loadTrendingSkills({ db: db().db, now: NOW })
    expect(skill?.morePosts).toHaveLength(MAX_MORE_POSTS)
    expect(skill?.social?.authorCount).toBe(MAX_MORE_POSTS + 3)
  })
})
