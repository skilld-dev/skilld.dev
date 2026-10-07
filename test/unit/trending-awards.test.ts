import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSkillTrendingAwards, planAwardWrites, recordTrendingAwards, SKILL_TRENDING_AWARDS_SQL } from '../../layers/registry/server/utils/trending-awards'
import { createSkillBadgeResponse, loadSkillBadgeAward } from '../../server/utils/skill-badge'
import { skillBadgeImagePath } from '../../shared/skill-badge'
import {
  headlineTrendingAward,
  trendingAwardBadgeLabel,
  trendingAwardLabel,
  trendingAwardPeriod,
} from '../../shared/trending-award'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// Wednesday 1 Oct 2026, 12:00 UTC.
const NOW = Date.UTC(2026, 9, 1, 12) / 1000
const DAY = 86_400

let harness: SqliteD1 | null = null
function db() {
  harness ??= createSqliteD1(allMigrations())
  return harness
}
afterEach(() => {
  harness?.close()
  harness = null
})

function addSkill(input: { owner: string, repo: string, name: string, stars?: number }) {
  db().raw.prepare(`INSERT OR IGNORE INTO repos (owner, repo, stars, repo_kind) VALUES (?, ?, ?, 'creator')`).run(input.owner, input.repo, input.stars ?? 10)
  db().raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, seo_indexable, description, rendered_skill_path)
     VALUES (?, ?, ?, ?, ?, 1, 1, 'd', ?)`,
  ).run(input.owner, input.repo, input.name, `${input.owner}/${input.name}`, input.name, `${input.name}/SKILL.md`)
}

function mention(input: { owner: string, repo: string, name: string, handle: string, at: number }) {
  const id = `p-${input.handle}-${input.name}-${input.at}`
  db().raw.prepare(
    `INSERT INTO x_posts (
       post_id, author_id, author_handle, author_name, author_followers,
       text_extract, lang, posted_at, first_seen_at,
       favourite_count, repost_count, reply_count, quote_count,
       bookmark_count, impression_count, metrics_updated_at,
       refresh_tier, next_refresh_at, author_avatar
     ) VALUES (?, ?, ?, NULL, 0, 'post', 'en', ?, ?, 5, 0, 0, 0, 0, 0, ?, 'hot', ?, NULL)`,
  ).run(id, `a-${input.handle}`, input.handle, input.at, input.at, input.at, input.at + 3600)
  db().raw.prepare(
    `INSERT INTO x_post_skills (post_id, owner, repo, slug, canonical_name, skill_path, detection, matched_on, verified_at)
     VALUES (?, ?, ?, ?, ?, 'SKILL.md', 'slash', 'directory', ?)`,
  ).run(id, input.owner, input.repo, input.name, input.name, NOW)
}

/** A Skill's awards, read the way the Skill page reads them. */
function skillAwards(skill: { owner: string, repo: string, name: string }) {
  const row = db().raw.prepare(`SELECT ${SKILL_TRENDING_AWARDS_SQL} FROM skills s WHERE s.owner = ? AND s.repo = ? AND s.name = ?`).get(skill.owner, skill.repo, skill.name) as { trending_awards: string | null }
  return parseSkillTrendingAwards(row.trending_awards)
}

function awardRows() {
  return db().raw.prepare('SELECT owner, repo, name, board, period, best_rank FROM skill_trending_awards ORDER BY board, best_rank').all()
}

describe('trendingAwardPeriod', () => {
  it('keys a week by the Monday that starts it, in UTC', () => {
    expect(trendingAwardPeriod('week', NOW)).toBe('2026-09-28')
    expect(trendingAwardPeriod('week', Date.UTC(2026, 8, 28) / 1000)).toBe('2026-09-28')
    // Sunday 23:59 still belongs to the week that started six days earlier.
    expect(trendingAwardPeriod('week', Date.UTC(2026, 9, 4, 23, 59) / 1000)).toBe('2026-09-28')
    expect(trendingAwardPeriod('week', Date.UTC(2026, 9, 5) / 1000)).toBe('2026-10-05')
  })

  it('keys a month by its calendar month', () => {
    expect(trendingAwardPeriod('month', NOW)).toBe('2026-10')
    expect(trendingAwardPeriod('month', Date.UTC(2026, 8, 30, 23, 59) / 1000)).toBe('2026-09')
  })
})

describe('award labels', () => {
  it('dates every label, so an old award never reads as current', () => {
    expect(trendingAwardBadgeLabel({ board: 'week', period: '2026-09-28', rank: 3 })).toBe('#3 trending · Sep 2026')
    expect(trendingAwardBadgeLabel({ board: 'month', period: '2026-10', rank: 1 })).toBe('#1 trending · Oct 2026')
    expect(trendingAwardLabel({ board: 'week', period: '2026-09-28', rank: 3 })).toMatch(/^#3 trending, week of 28 Sept? 2026$/)
    expect(trendingAwardLabel({ board: 'month', period: '2026-10', rank: 1 })).toBe('#1 trending, October 2026')
  })
})

describe('headlineTrendingAward', () => {
  it('leads with the best rank, then the month board, then the newest period', () => {
    const weekTwo = { board: 'week' as const, period: '2026-09-28', rank: 2 }
    const monthTwo = { board: 'month' as const, period: '2026-09', rank: 2 }
    const newerMonthTwo = { board: 'month' as const, period: '2026-10', rank: 2 }
    const weekFive = { board: 'week' as const, period: '2026-10-05', rank: 5 }

    expect(headlineTrendingAward([])).toBeNull()
    expect(headlineTrendingAward([weekFive, weekTwo])).toEqual(weekTwo)
    expect(headlineTrendingAward([weekTwo, monthTwo])).toEqual(monthTwo)
    expect(headlineTrendingAward([monthTwo, newerMonthTwo, weekFive])).toEqual(newerMonthTwo)
  })
})

describe('planAwardWrites', () => {
  const skill = { owner: 'o', repo: 'r', name: 'a' }

  it('writes a new award and keeps the best rank seen in one run', () => {
    expect(planAwardWrites(new Map(), [
      { board: 'week', rank: 4, skill },
      { board: 'week', rank: 2, skill },
      { board: 'month', rank: 7, skill },
    ], NOW)).toEqual([
      { skill, board: 'week', period: '2026-09-28', rank: 2 },
      { skill, board: 'month', period: '2026-10', rank: 7 },
    ])
  })

  it('writes only a better rank than the one held for the period', () => {
    const held = new Map([['o/r/a/week/2026-09-28', 3]])
    expect(planAwardWrites(held, [{ board: 'week', rank: 5, skill }], NOW)).toEqual([])
    expect(planAwardWrites(held, [{ board: 'week', rank: 3, skill }], NOW)).toEqual([])
    expect(planAwardWrites(held, [{ board: 'week', rank: 1, skill }], NOW)).toEqual([
      { skill, board: 'week', period: '2026-09-28', rank: 1 },
    ])
  })
})

describe('recordTrendingAwards', () => {
  it('awards evidenced rows by board position and keeps the award after they leave', async () => {
    addSkill({ owner: 'anthropics', repo: 'skills', name: 'frontend-design' })
    addSkill({ owner: 'emil', repo: 'skills', name: 'animate' })
    mention({ owner: 'anthropics', repo: 'skills', name: 'frontend-design', handle: 'h1', at: NOW - 3600 })
    mention({ owner: 'anthropics', repo: 'skills', name: 'frontend-design', handle: 'h2', at: NOW - 3600 })
    mention({ owner: 'emil', repo: 'skills', name: 'animate', handle: 'h3', at: NOW - 3600 })

    const written = await recordTrendingAwards(db().db, NOW)
    expect(written).toHaveLength(4)
    expect(awardRows()).toEqual([
      { owner: 'anthropics', repo: 'skills', name: 'frontend-design', board: 'month', period: '2026-10', best_rank: 1 },
      { owner: 'emil', repo: 'skills', name: 'animate', board: 'month', period: '2026-10', best_rank: 2 },
      { owner: 'anthropics', repo: 'skills', name: 'frontend-design', board: 'week', period: '2026-09-28', best_rank: 1 },
      { owner: 'emil', repo: 'skills', name: 'animate', board: 'week', period: '2026-09-28', best_rank: 2 },
    ])

    // A replay in the same hour writes nothing.
    expect(await recordTrendingAwards(db().db, NOW + 60)).toEqual([])

    // Sixty days later every mention is outside both windows.
    expect(await recordTrendingAwards(db().db, NOW + 60 * DAY)).toEqual([])
    expect(skillAwards({ owner: 'emil', repo: 'skills', name: 'animate' })).toEqual([
      { board: 'month', period: '2026-10', rank: 2 },
      { board: 'week', period: '2026-09-28', rank: 2 },
    ])
  })

  it('never worsens a rank the period already holds', async () => {
    addSkill({ owner: 'a', repo: 'one', name: 'first' })
    addSkill({ owner: 'b', repo: 'two', name: 'second' })
    mention({ owner: 'a', repo: 'one', name: 'first', handle: 'h1', at: NOW - 3600 })
    await recordTrendingAwards(db().db, NOW)

    // Two later posts push `second` above `first` within the same week.
    mention({ owner: 'b', repo: 'two', name: 'second', handle: 'h2', at: NOW + 3600 })
    mention({ owner: 'b', repo: 'two', name: 'second', handle: 'h3', at: NOW + 3600 })
    await recordTrendingAwards(db().db, NOW + 2 * 3600)

    const weekRank = (owner: string, repo: string, name: string) =>
      skillAwards({ owner, repo, name }).find(award => award.board === 'week')?.rank
    expect(weekRank('b', 'two', 'second')).toBe(1)
    expect(weekRank('a', 'one', 'first')).toBe(1)
  })

  it('gives star filler no award', async () => {
    addSkill({ owner: 'quiet', repo: 'repo', name: 'starred', stars: 50_000 })
    await recordTrendingAwards(db().db, NOW)
    expect(awardRows()).toEqual([])
  })
})

describe('rEADME badge award', () => {
  it('asks for the award only when requested', () => {
    const input = { owner: 'emil', repo: 'skills', name: 'animate', registryPath: '/gh/emil/skills/animate' }
    expect(skillBadgeImagePath(input, 'light')).toBe('/b/emil/skills/animate?theme=light')
    expect(skillBadgeImagePath({ ...input, showTrendingAward: true }, 'light')).toBe('/b/emil/skills/animate?trending=1&theme=light')
  })

  it('shows the best award a Skill or its repository holds', async () => {
    addSkill({ owner: 'emil', repo: 'skills', name: 'animate' })
    addSkill({ owner: 'emil', repo: 'skills', name: 'review' })
    const insert = db().raw.prepare(`INSERT INTO skill_trending_awards (owner, repo, name, board, period, best_rank, ranked_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    insert.run('emil', 'skills', 'animate', 'week', '2026-09-28', 4, NOW)
    insert.run('emil', 'skills', 'review', 'month', '2026-09', 2, NOW)

    const skillAward = await loadSkillBadgeAward(db().db, { _tag: 'skill', owner: 'Emil', repo: 'skills', name: 'animate' })
    expect(skillAward).toEqual({ board: 'week', period: '2026-09-28', rank: 4 })
    const repoAward = await loadSkillBadgeAward(db().db, { _tag: 'repository', owner: 'emil', repo: 'skills' })
    expect(repoAward).toEqual({ board: 'month', period: '2026-09', rank: 2 })
    expect(await loadSkillBadgeAward(db().db, { _tag: 'skill', owner: 'emil', repo: 'skills', name: 'none' })).toBeNull()
  })

  it('renders the dated award segment and refreshes hourly', async () => {
    const response = createSkillBadgeResponse({
      target: { _tag: 'skill', owner: 'emil', repo: 'skills', name: 'animate' },
      theme: 'light',
      award: { board: 'week', period: '2026-09-28', rank: 3 },
    })

    expect(response.headers.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=86400')
    const svg = await response.text()
    expect(svg).toMatch(/<title>Agent skill on skilld\.dev, #3 trending, week of 28 Sept? 2026<\/title>/)
    expect(svg).toContain('>#3 trending · Sep 2026<')
  })

  it('stays plain, and still refreshes hourly, while the Skill has no award', async () => {
    const response = createSkillBadgeResponse({
      target: { _tag: 'skill', owner: 'emil', repo: 'skills', name: 'animate' },
      award: null,
    })

    expect(response.headers.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=86400')
    const svg = await response.text()
    expect(svg).toContain('<title>Agent skill on skilld.dev</title>')
    expect(svg).toContain('width="153" height="22"')
  })
})
