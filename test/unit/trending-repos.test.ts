// @vitest-environment node
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { loadTrendingRepos } from '../../shared/server/trending-repos'
import { createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0100_x_discovery_daily_budget.sql',
]
const NOW = 1_760_000_000
const HOUR = 3600

let harness: SqliteD1 | null = null

/**
 * The registry tables this module joins against, reduced to the columns the
 * queries actually read. Building the full schema here would couple the test
 * to migrations that have nothing to do with trending.
 */
const REGISTRY_FIXTURE = `
  CREATE TABLE skills (
    owner TEXT, repo TEXT, name TEXT, display_name TEXT, slug TEXT,
    description TEXT, source_resolved INTEGER DEFAULT 1
  );
  CREATE TABLE repos (owner TEXT, repo TEXT, stars INTEGER, description TEXT);
`

function db() {
  if (!harness) {
    harness = createSqliteD1(MIGRATIONS)
    harness.raw.exec(REGISTRY_FIXTURE)
  }
  return harness
}

afterEach(() => {
  harness?.close()
  harness = null
})

interface SeedPost {
  id: string
  owner: string
  repo: string
  authorId?: string
  favourites: number
  previousFavourites?: number
  postedAt?: number
  observedAt?: number
  /** Extra repos this post also names, to exercise listicle dilution. */
  repoCount?: number
  lang?: string
  text?: string
}

function seed(input: SeedPost) {
  const repoCount = input.repoCount ?? 1
  const observedAt = input.observedAt ?? NOW
  db().raw.prepare(
    `INSERT INTO x_posts (
       post_id, author_id, author_handle, author_name, author_followers,
       text_extract, lang, posted_at, first_seen_at,
       favourite_count, repost_count, reply_count, quote_count,
       bookmark_count, impression_count, metrics_updated_at,
       refresh_tier, next_refresh_at
     ) VALUES (?, ?, ?, 'Display Name', 100, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, 'hot', ?)`,
  ).run(
    input.id,
    input.authorId ?? `author-${input.id}`,
    `handle_${input.authorId ?? input.id}`,
    input.text ?? `post ${input.id} about ${input.owner}/${input.repo}`,
    input.lang ?? 'en',
    input.postedAt ?? NOW - HOUR,
    NOW - HOUR,
    input.favourites,
    observedAt,
    observedAt + HOUR,
  )
  db().raw.prepare(
    `INSERT INTO x_post_repos (post_id, owner, repo, match_kind) VALUES (?, ?, ?, 'link')`,
  ).run(input.id, input.owner, input.repo)
  // Filler links so the post's repo_count matches what the caller asked for.
  for (let i = 1; i < repoCount; i++) {
    db().raw.prepare(
      `INSERT INTO x_post_repos (post_id, owner, repo, match_kind) VALUES (?, ?, ?, 'link')`,
    ).run(input.id, 'filler', `repo-${input.id}-${i}`)
  }
  db().raw.prepare(
    `INSERT INTO x_post_metrics (post_id, observed_at, favourite_count, repost_count,
       reply_count, quote_count, bookmark_count, impression_count)
     VALUES (?, ?, ?, 0, 0, 0, 0, 0)`,
  ).run(input.id, observedAt, input.favourites)

  if (input.previousFavourites !== undefined) {
    db().raw.prepare(
      `INSERT INTO x_post_metrics (post_id, observed_at, favourite_count, repost_count,
         reply_count, quote_count, bookmark_count, impression_count)
       VALUES (?, ?, ?, 0, 0, 0, 0, 0)`,
    ).run(input.id, observedAt - HOUR, input.previousFavourites)
  }
}

function seedSkill(owner: string, repo: string, name: string) {
  db().raw.prepare(
    `INSERT INTO skills (owner, repo, name, display_name, slug, description, source_resolved)
     VALUES (?, ?, ?, ?, ?, 'a skill', 1)`,
  ).run(owner, repo, name, name, `${owner}/${repo}/${name}`)
}

describe('loadTrendingRepos', () => {
  it('returns nothing when no posts have been ingested', async () => {
    expect(await loadTrendingRepos({ db: db().db, now: NOW })).toEqual([])
  })

  it('ranks a repo that is gaining above one that has gone quiet', async () => {
    seed({ id: '1', owner: 'o', repo: 'climbing', favourites: 500, previousFavourites: 100 })
    seed({ id: '2', owner: 'o', repo: 'flat', favourites: 500, previousFavourites: 500 })

    // Both stay on the page: a repo that stopped moving this hour has not
    // stopped being relevant. Ordering is what carries the signal.
    const result = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(result.map(r => r.repo)).toEqual(['climbing', 'flat'])
  })

  it('surfaces repositories beyond the familiar GitHub leaders first', async () => {
    seed({ id: 'leader', owner: 'known', repo: 'leader', favourites: 1000, previousFavourites: 0 })
    seed({ id: 'discovery', owner: 'new', repo: 'discovery', favourites: 10, previousFavourites: 0 })

    const result = await loadTrendingRepos({
      db: db().db,
      now: NOW,
      limit: 1,
      deprioritizeRepositories: new Set(['known/leader']),
    })

    expect(result.map(r => `${r.owner}/${r.repo}`)).toEqual(['new/discovery'])
  })

  it('pairs each post with the snapshot before its latest, so velocity is real', async () => {
    seed({ id: '1', owner: 'o', repo: 'r', favourites: 300, previousFavourites: 100 })
    const [entry] = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(entry?.score).toBeGreaterThan(0)
    expect(entry?.totals.favouriteCount).toBe(300)
  })

  it('quotes the strongest post as page evidence', async () => {
    seed({ id: 'quiet', owner: 'o', repo: 'r', authorId: 'a1', favourites: 5, previousFavourites: 0 })
    seed({ id: 'loud', owner: 'o', repo: 'r', authorId: 'a2', favourites: 900, previousFavourites: 0 })

    const [entry] = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(entry?.evidence?.postId).toBe('loud')
    expect(entry?.evidence?.url).toBe('https://x.com/handle_a2/status/loud')
    expect(entry?.evidence?.authorName).toBe('Display Name')
    expect(entry?.evidence?.text).toContain('o/r')
  })

  it('attaches indexed skills and repo metadata', async () => {
    seed({ id: '1', owner: 'kepano', repo: 'obsidian-skills', favourites: 300, previousFavourites: 0 })
    seedSkill('kepano', 'obsidian-skills', 'note-taking')
    db().raw.prepare(`INSERT INTO repos (owner, repo, stars, description) VALUES (?, ?, ?, ?)`).run('kepano', 'obsidian-skills', 1200, 'Obsidian skills')

    const [entry] = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(entry?.stars).toBe(1200)
    expect(entry?.repoDescription).toBe('Obsidian skills')
    expect(entry?.skills).toEqual([{
      name: 'note-taking',
      displayName: 'note-taking',
      slug: 'kepano/obsidian-skills/note-taking',
      description: 'a skill',
      registryPath: '/gh/kepano/obsidian-skills',
    }])
  })

  it('hides a repo with no indexed skills from the public list', async () => {
    seed({ id: '1', owner: 'o', repo: 'indexed', favourites: 300, previousFavourites: 0 })
    seed({ id: '2', owner: 'o', repo: 'unknown', favourites: 900, previousFavourites: 0 })
    seedSkill('o', 'indexed', 'thing')

    const publicList = await loadTrendingRepos({ db: db().db, now: NOW, indexedOnly: true })
    expect(publicList.map(r => r.repo)).toEqual(['indexed'])

    const reviewList = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(reviewList.map(r => r.repo).sort()).toEqual(['indexed', 'unknown'])
  })

  it('reports ledger status so an unreviewed repo can be flagged', async () => {
    seed({ id: '1', owner: 'o', repo: 'r', favourites: 300, previousFavourites: 0 })
    db().raw.prepare(
      `INSERT INTO discovery_ledger (source, owner, repo, evidence_url, evidence_text,
         evidence_score, first_seen_at, last_seen_at, status)
       VALUES ('x', 'o', 'r', 'u', 't', 1, ?, ?, 'submitted')`,
    ).run(NOW, NOW)

    const [entry] = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(entry?.ledgerStatus).toBe('submitted')
  })

  it('ignores posts older than the trend window', async () => {
    seed({ id: 'ancient', owner: 'o', repo: 'r', favourites: 9999, postedAt: NOW - 400 * 24 * HOUR })
    expect(await loadTrendingRepos({ db: db().db, now: NOW })).toEqual([])
  })

  it('never quotes the same post against two repos', async () => {
    // One thread naming several repos ranked all of them, and the page showed
    // the identical wall of text twice. Each repo also has a post of its own,
    // so the second should fall back to that rather than repeat the thread.
    seed({ id: 'thread', owner: 'a', repo: 'one', authorId: 'lister', favourites: 900, previousFavourites: 0 })
    db().raw.prepare(
      `INSERT INTO x_post_repos (post_id, owner, repo, match_kind) VALUES (?, ?, ?, 'link')`,
    ).run('thread', 'a', 'two')
    seed({ id: 'own-one', owner: 'a', repo: 'one', authorId: 'w1', favourites: 10, previousFavourites: 0 })
    seed({ id: 'own-two', owner: 'a', repo: 'two', authorId: 'w2', favourites: 10, previousFavourites: 0 })

    const result = await loadTrendingRepos({ db: db().db, now: NOW })
    const quoted = result.map(r => r.evidence?.postId)
    expect(new Set(quoted).size).toBe(quoted.length)
  })

  it('prefers an English post to quote on an English page', async () => {
    seed({ id: 'zh', owner: 'a', repo: 'one', authorId: 'z', favourites: 500, previousFavourites: 0, lang: 'zh' })
    seed({ id: 'en', owner: 'a', repo: 'one', authorId: 'e', favourites: 480, previousFavourites: 0, lang: 'en' })

    const [entry] = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(entry?.evidence?.postId).toBe('en')
  })

  it('quotes a non-English post when that is all the repo has', async () => {
    seed({ id: 'zh', owner: 'a', repo: 'one', authorId: 'z', favourites: 500, previousFavourites: 0, lang: 'zh' })

    const [entry] = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(entry?.evidence?.postId).toBe('zh')
  })

  it('strips links and truncates the quoted text', async () => {
    seed({
      id: '1',
      owner: 'a',
      repo: 'one',
      favourites: 100,
      previousFavourites: 0,
      text: `check this out https://t.co/abc ${'padding '.repeat(80)}`,
    })

    const [entry] = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(entry?.evidence?.text).not.toContain('https://')
    expect(entry?.evidence?.text.length).toBeLessThan(260)
  })

  it('stays inside D1\'s bound-parameter limit when the candidate set is large', async () => {
    // The indexed filter over-fetches limit * 4 candidates. At limit 24 that is
    // 96 repos and 192 bound parameters, which D1 rejects outright:
    // "variable number must be between ?1 and ?100". Every test passed and the
    // first real request 500'd. The harness now enforces the same limit.
    for (let i = 0; i < 120; i++) {
      seed({
        id: `p${i}`,
        owner: `owner${String(i).padStart(3, '0')}`,
        repo: 'repo',
        favourites: 500 - i,
        previousFavourites: 0,
      })
      seedSkill(`owner${String(i).padStart(3, '0')}`, 'repo', 'thing')
    }

    const result = await loadTrendingRepos({ db: db().db, now: NOW, limit: 24, indexedOnly: true })
    expect(result).toHaveLength(24)
    expect(result[0]?.skills).toHaveLength(1)
  })

  it('fills a small page even when most ranked repos are unindexed', async () => {
    // Production shape: 7 indexed repos scattered through a much longer ranked
    // list. The old `limit * 4` over-fetch returned 2 for limit=6 and 7 for
    // limit=24 from identical data, so the homepage section fell under its own
    // display threshold and never rendered.
    for (let i = 0; i < 60; i++) {
      const owner = `owner${String(i).padStart(3, '0')}`
      seed({ id: `p${i}`, owner, repo: 'repo', favourites: 1000 - i, previousFavourites: 0 })
      // Only every tenth repo is indexed, so the top 24 hold barely any.
      if (i % 10 === 9)
        seedSkill(owner, 'repo', 'thing')
    }

    const small = await loadTrendingRepos({ db: db().db, now: NOW, limit: 6, indexedOnly: true })
    const large = await loadTrendingRepos({ db: db().db, now: NOW, limit: 24, indexedOnly: true })

    expect(small).toHaveLength(6)
    // A smaller page must be a prefix of the larger one, never a different set.
    expect(small.map(r => r.owner)).toEqual(large.slice(0, 6).map(r => r.owner))
    expect(small.every(r => r.skills.length > 0)).toBe(true)
  })

  it('honours the requested limit', async () => {
    for (let i = 0; i < 8; i++)
      seed({ id: `p${i}`, owner: 'o', repo: `r${i}`, favourites: 100 + i, previousFavourites: 0 })

    const result = await loadTrendingRepos({ db: db().db, now: NOW, limit: 3 })
    expect(result).toHaveLength(3)
  })

  it('does not let one listicle post fill the page with identical entries', async () => {
    // A live run had a single tweet naming seven repos place all seven at an
    // identical score, so the page was seven rows quoting the same post. Each
    // entry now carries a seventh of that post's weight.
    // One post, seven repo links: the exact shape the live run produced.
    seed({
      id: 'listicle',
      owner: 'listed',
      repo: 'entry-0',
      authorId: 'lister',
      favourites: 700,
      previousFavourites: 0,
    })
    for (let i = 1; i < 7; i++) {
      db().raw.prepare(
        `INSERT INTO x_post_repos (post_id, owner, repo, match_kind) VALUES (?, ?, ?, 'link')`,
      ).run('listicle', 'listed', `entry-${i}`)
    }
    seed({
      id: 'dedicated',
      owner: 'focused',
      repo: 'repo',
      authorId: 'writer',
      favourites: 300,
      previousFavourites: 0,
    })

    const result = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(result[0]?.repo).toBe('repo')
  })

  it('counts one author once, so a repeat poster cannot manufacture a trend', async () => {
    for (let i = 0; i < 12; i++)
      seed({ id: `spam${i}`, owner: 'o', repo: 'spammed', authorId: 'same', favourites: 50, previousFavourites: 0 })
    seed({ id: 'organic', owner: 'o', repo: 'real', authorId: 'x1', favourites: 50, previousFavourites: 0 })
    seed({ id: 'organic2', owner: 'o', repo: 'real', authorId: 'x2', favourites: 50, previousFavourites: 0 })

    const result = await loadTrendingRepos({ db: db().db, now: NOW })
    expect(result[0]?.repo).toBe('real')
    expect(result.find(r => r.repo === 'spammed')?.authorCount).toBe(1)
  })
})
