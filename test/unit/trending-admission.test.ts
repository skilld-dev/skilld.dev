// @vitest-environment node
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { queryAllSkillsForSitemap } from '../../layers/registry/server/utils/skills-registry'
import {
  admitTrendingSkills,
  isSkillIndexable,
  listAdmittedSkills,
  planAdmissions,
  SKILL_INDEX_INPUT_COLUMNS_SQL,
} from '../../layers/registry/server/utils/trending-admission'
import { listTrendingSitemapEntries } from '../../layers/registry/server/utils/trending-sitemap'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_760_000_000
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

function addSkill(input: { owner: string, repo: string, name: string, indexable?: boolean, kind?: string, stars?: number }) {
  db().raw.prepare(`INSERT OR IGNORE INTO repos (owner, repo, stars, repo_kind) VALUES (?, ?, ?, ?)`).run(input.owner, input.repo, input.stars ?? 10, input.kind ?? 'creator')
  db().raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, seo_indexable, description, rendered_skill_path)
     VALUES (?, ?, ?, ?, ?, 1, ?, 'd', ?)`,
  ).run(input.owner, input.repo, input.name, `${input.owner}/${input.name}`, input.name, input.indexable === false ? 0 : 1, `${input.name}/SKILL.md`)
}

function mention(input: { owner: string, repo: string, name: string, handle: string, at: number }) {
  const id = `p-${input.handle}-${input.at}`
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

function admitted(): string[] {
  return (db().raw.prepare('SELECT owner, repo, name FROM skill_trending_admissions ORDER BY 1, 2, 3').all() as Array<{ owner: string, repo: string, name: string }>)
    .map(r => `${r.owner}/${r.repo}/${r.name}`)
}

describe('planAdmissions', () => {
  const a = { owner: 'o', repo: 'r', name: 'a' }
  const b = { owner: 'o', repo: 'r', name: 'b' }

  it('returns only Skills not yet admitted, once each, first board wins', () => {
    const plan = planAdmissions(new Set(['o/r/a']), [
      { board: 'week', skill: a },
      { board: 'month', skill: b },
      { board: 'all', skill: b },
    ])
    expect(plan).toEqual([{ skill: b, firstBoard: 'month' }])
  })

  it('never shrinks the set when a board empties', () => {
    expect(planAdmissions(new Set(['o/r/a', 'o/r/b']), [])).toEqual([])
  })
})

describe('isSkillIndexable', () => {
  const base = { seo_indexable: 1, trending_admitted: 1, repo_kind: 'creator' }

  it('needs the quality score and an admission', () => {
    expect(isSkillIndexable(base)).toBe(true)
    expect(isSkillIndexable({ ...base, trending_admitted: 0 })).toBe(false)
    expect(isSkillIndexable({ ...base, seo_indexable: 0 })).toBe(false)
  })

  it('keeps aggregator repositories out', () => {
    expect(isSkillIndexable({ ...base, repo_kind: 'aggregator' })).toBe(false)
  })
})

describe('admitTrendingSkills', () => {
  it('admits a trending Skill and keeps it after it leaves the board', async () => {
    addSkill({ owner: 'anthropics', repo: 'skills', name: 'frontend-design' })
    addSkill({ owner: 'quiet', repo: 'repo', name: 'unloved' })
    mention({ owner: 'anthropics', repo: 'skills', name: 'frontend-design', handle: 'h1', at: NOW - 3600 })

    const first = await admitTrendingSkills(db().db, NOW)
    expect(first.map(a => a.skill.name)).toContain('frontend-design')
    expect(admitted()).toContain('anthropics/skills/frontend-design')
    expect(admitted()).not.toContain('quiet/repo/unloved')

    // Sixty days later the mention is outside every window.
    await admitTrendingSkills(db().db, NOW + 60 * DAY)
    expect(admitted()).toContain('anthropics/skills/frontend-design')
  })

  it('is safe to replay', async () => {
    addSkill({ owner: 'a', repo: 'b', name: 'c' })
    mention({ owner: 'a', repo: 'b', name: 'c', handle: 'h', at: NOW - 60 })
    await admitTrendingSkills(db().db, NOW)
    const before = admitted()
    expect(await admitTrendingSkills(db().db, NOW + 10)).toEqual([])
    expect(admitted()).toEqual(before)
  })
})

describe('sitemap equals the indexable set', () => {
  it('lists a Skill exactly when its page is index,follow', async () => {
    addSkill({ owner: 'o1', repo: 'r1', name: 'admitted-ok' })
    addSkill({ owner: 'o2', repo: 'r2', name: 'not-admitted' })
    addSkill({ owner: 'o3', repo: 'r3', name: 'admitted-low-score', indexable: false })
    addSkill({ owner: 'o4', repo: 'r4', name: 'admitted-aggregator', kind: 'aggregator' })
    addSkill({ owner: 'o5', repo: 'r5', name: 'other-ok' })
    for (const [owner, repo, name] of [['o1', 'r1', 'admitted-ok'], ['o3', 'r3', 'admitted-low-score'], ['o4', 'r4', 'admitted-aggregator'], ['o5', 'r5', 'other-ok']]) {
      db().raw.prepare(`INSERT INTO skill_trending_admissions (owner, repo, name, admitted_at, first_board) VALUES (?, ?, ?, ?, 'week')`).run(owner, repo, name, NOW)
    }

    const inSitemap = new Set((await queryAllSkillsForSitemap(db().db)).map(e => `${e.owner}/${e.repo}/${e.name}`))
    const rows = db().raw.prepare(
      `SELECT s.owner, s.repo, s.name, s.seo_indexable, ${SKILL_INDEX_INPUT_COLUMNS_SQL}
       FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo`,
    ).all() as Array<{ owner: string, repo: string, name: string, seo_indexable: number, trending_admitted: number, repo_kind: string }>
    const indexable = new Set(rows.filter(isSkillIndexable).map(r => `${r.owner}/${r.repo}/${r.name}`))

    expect(inSitemap).toEqual(indexable)
    expect(inSitemap).toEqual(new Set(['o1/r1/admitted-ok', 'o5/r5/other-ok']))
  })
})

describe('listAdmittedSkills', () => {
  it('lists only indexable admitted Skills, by first board', async () => {
    addSkill({ owner: 'a', repo: 'one', name: 'week-skill' })
    addSkill({ owner: 'a', repo: 'two', name: 'month-skill' })
    addSkill({ owner: 'a', repo: 'three', name: 'low-score', indexable: false })
    const admit = db().raw.prepare(`INSERT INTO skill_trending_admissions (owner, repo, name, admitted_at, first_board) VALUES (?, ?, ?, ?, ?)`)
    admit.run('a', 'one', 'week-skill', NOW, 'week')
    admit.run('a', 'two', 'month-skill', NOW, 'month')
    admit.run('a', 'three', 'low-score', NOW, 'week')

    const week = await listAdmittedSkills(db().db, { board: 'week', page: 1 })
    expect(week.rows.map(r => r.name)).toEqual(['week-skill'])
    expect(week.total).toBe(1)
    const none = await listAdmittedSkills(db().db, { board: 'all', page: 1 })
    expect(none.rows).toEqual([])
  })
})

describe('listTrendingSitemapEntries', () => {
  it('lists a board only once it holds enough named Skills to be indexable', async () => {
    expect(await listTrendingSitemapEntries(db().db, NOW)).toEqual([])

    for (let i = 0; i < 8; i++) {
      addSkill({ owner: `o${i}`, repo: `r${i}`, name: `s${i}` })
      mention({ owner: `o${i}`, repo: `r${i}`, name: `s${i}`, handle: `h${i}`, at: NOW - 3600 })
    }
    const locs = (await listTrendingSitemapEntries(db().db, NOW)).map(e => e.loc)
    expect(locs).toEqual(['/skills/trending?range=week', '/skills/trending'])
  })
})
