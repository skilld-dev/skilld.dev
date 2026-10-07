import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadTrendingSkills } from '../../shared/server/trending-skills'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = allMigrations()
const NOW = 1_760_000_000
const DAY = 86_400

let harness: SqliteD1 | null = null

function db() {
  harness ??= createSqliteD1(MIGRATIONS)
  return harness
}

afterEach(() => {
  harness?.close()
  harness = null
})

function seedRepo(owner: string, repo: string) {
  db().raw.prepare(
    `INSERT OR IGNORE INTO repos (owner, repo) VALUES (?, ?)`,
  ).run(owner, repo)
}

/** One indexed skill in a repo. Repos with several cannot attribute a surge. */
function seedSkill(owner: string, repo: string, name: string, displayName?: string) {
  seedRepo(owner, repo)
  // `name` is the routing identity that `skill-mention-verify.ts` reads;
  // `slug` is a separate NOT NULL column and is set alongside it.
  db().raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  ).run(owner, repo, name, name, displayName ?? name, `${name}/SKILL.md`)
}

function seedSurge(owner: string, repo: string, latestGain: number, baselineGain = 1) {
  const observedDay = Math.floor((NOW - DAY) / DAY) * DAY
  db().raw.prepare(
    `INSERT INTO repo_star_surges
       (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(owner, repo, observedDay, latestGain, baselineGain, 5000, NOW - DAY)
}

describe('gitHub attribution requires a single-skill repo', () => {
  it('names the skill when the surging repo holds exactly one', async () => {
    seedSkill('pixeline', 'atproto-oauth', 'atproto-oauth')
    seedSurge('pixeline', 'atproto-oauth', 800)

    const trending = await loadTrendingSkills({ db: db().db, now: NOW })

    expect(trending).toHaveLength(1)
    expect(trending[0]).toMatchObject({
      slug: 'atproto-oauth',
      attribution: 'github',
    })
  })

  it('names nothing when the surging repo holds several skills', async () => {
    // A surge on anthropics/skills says twenty things at once, which is to say
    // nothing. Attributing it to any one of them would invent a fact.
    seedSkill('anthropics', 'skills', 'frontend-design')
    seedSkill('anthropics', 'skills', 'canvas-design')
    seedSurge('anthropics', 'skills', 4000)

    const trending = await loadTrendingSkills({ db: db().db, now: NOW })

    expect(trending).toEqual([])
  })

  it('ignores a surge on a repo with no indexed skills at all', async () => {
    seedRepo('someone', 'not-a-skill-repo')
    seedSurge('someone', 'not-a-skill-repo', 900)

    expect(await loadTrendingSkills({ db: db().db, now: NOW })).toEqual([])
  })

  it('ignores a surge older than the window', async () => {
    seedSkill('old', 'repo', 'old-skill')
    db().raw.prepare(
      `INSERT INTO repo_star_surges
         (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('old', 'repo', Math.floor((NOW - 30 * DAY) / DAY) * DAY, 900, 1, 5000, NOW - 30 * DAY)

    expect(await loadTrendingSkills({ db: db().db, now: NOW })).toEqual([])
  })

  it('counts a multi-day surge once, at its strongest day', async () => {
    seedSkill('steady', 'climb', 'steady-skill')
    for (let day = 1; day <= 3; day++) {
      db().raw.prepare(
        `INSERT INTO repo_star_surges
           (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('steady', 'climb', Math.floor((NOW - day * DAY) / DAY) * DAY, 100 * day, 1, 5000, NOW - day * DAY)
    }

    const trending = await loadTrendingSkills({ db: db().db, now: NOW })

    expect(trending).toHaveLength(1)
    // Newest day first, not the sum: three days of surging is not a 600-star day.
    expect(trending[0]?.github?.latestGain).toBe(100)
  })

  it('shows the frontmatter name while keeping the slug for routing', async () => {
    seedSkill('kunpai', 'mars-claude', 'mars-claude', 'mars-review')
    seedSurge('kunpai', 'mars-claude', 400)

    const trending = await loadTrendingSkills({ db: db().db, now: NOW })

    expect(trending[0]).toMatchObject({ slug: 'mars-claude', canonicalName: 'mars-review' })
  })
})

describe('the two routes combined', () => {
  function seedMention(input: {
    owner: string
    repo: string
    slug: string
    handle: string
    likes: number
    postId: string
    platform?: 'x' | 'bsky'
  }) {
    db().raw.prepare(
      `INSERT INTO x_posts (
         post_id, platform, author_id, author_handle, author_name, author_followers,
         text_extract, lang, posted_at, first_seen_at, favourite_count, repost_count,
         reply_count, quote_count, bookmark_count, impression_count,
         metrics_updated_at, refresh_tier, next_refresh_at
       ) VALUES (?, ?, ?, ?, 'Name', 10, 'text', 'en', ?, ?, ?, 0, 0, 0, 0, 0, ?, 'frozen', 0)`,
    ).run(
      input.postId,
      input.platform ?? 'x',
      `did:${input.handle}`,
      input.handle,
      NOW - 3600,
      NOW - 3600,
      input.likes,
      NOW,
    )
    db().raw.prepare(
      `INSERT INTO x_post_skills
         (post_id, owner, repo, slug, canonical_name, skill_path, detection, matched_on, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, 'prose', 'registry', ?)`,
    ).run(input.postId, input.owner, input.repo, input.slug, input.slug, `${input.slug}/SKILL.md`, NOW)
  }

  it('marks a skill both routes agree on as corroborated', async () => {
    seedSkill('pixeline', 'atproto-oauth', 'atproto-oauth')
    seedSurge('pixeline', 'atproto-oauth', 300)
    seedMention({ owner: 'pixeline', repo: 'atproto-oauth', slug: 'atproto-oauth', handle: 'a', likes: 5, postId: 'p1' })

    const trending = await loadTrendingSkills({ db: db().db, now: NOW })

    expect(trending[0]).toMatchObject({ slug: 'atproto-oauth', attribution: 'both' })
  })

  it('ranks a socially named skill above a star-only one', async () => {
    seedSkill('social', 'repo', 'talked-about')
    seedMention({ owner: 'social', repo: 'repo', slug: 'talked-about', handle: 'a', likes: 2, postId: 'p1' })
    seedSkill('stars', 'repo', 'starred-only')
    seedSurge('stars', 'repo', 100)

    const trending = await loadTrendingSkills({ db: db().db, now: NOW })

    expect(trending.map(t => t.slug)).toEqual(['talked-about', 'starred-only'])
  })

  it('links Bluesky evidence to bsky.app, not x.com', async () => {
    seedSkill('bsky', 'repo', 'bsky-skill')
    seedMention({
      owner: 'bsky',
      repo: 'repo',
      slug: 'bsky-skill',
      handle: 'someone.bsky.social',
      likes: 3,
      postId: 'at://did:plc:abc/app.bsky.feed.post/xyz',
      platform: 'bsky',
    })

    const trending = await loadTrendingSkills({ db: db().db, now: NOW })

    expect(trending[0]?.evidence?.url).toBe('https://bsky.app/profile/did:someone.bsky.social/post/xyz')
    expect(trending[0]?.evidence?.platform).toBe('bsky')
  })
})
