// @vitest-environment node
import type { TrendingScope } from '../../shared/server/trending-skills'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { findClusterCandidates } from '../../layers/registry/server/utils/cluster-membership'
import { loadTrendingSkills } from '../../shared/server/trending-skills'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

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

interface SkillSeed {
  owner: string
  repo?: string
  slug: string
  category?: string | null
  abstract?: 0 | 1 | null
  indexable?: 0 | 1
}

function seedSkill(skill: SkillSeed): { owner: string, repo: string, slug: string } {
  const repo = skill.repo ?? 'skills'
  db().raw.prepare(`INSERT OR IGNORE INTO repos (owner, repo, stars) VALUES (?, ?, 100)`).run(skill.owner, repo)
  db().raw.prepare(
    `INSERT OR IGNORE INTO skills
       (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path,
        abstractness_category, is_abstract, seo_indexable)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  ).run(skill.owner, repo, skill.slug, skill.slug, skill.slug, `${skill.slug}/SKILL.md`, skill.category ?? null, skill.abstract ?? null, skill.indexable ?? 0)
  return { owner: skill.owner, repo, slug: skill.slug }
}

let seq = 0
/** One post by `handle` that names every listed Skill, as a listicle does. */
function post(handle: string, skills: { owner: string, repo: string, slug: string }[], likes = 5) {
  const id = `p${++seq}`
  const postedAt = NOW - HOUR
  db().raw.prepare(
    `INSERT INTO x_posts (
       post_id, author_id, author_handle, author_name, author_followers,
       text_extract, lang, posted_at, first_seen_at,
       favourite_count, repost_count, reply_count, quote_count,
       bookmark_count, impression_count, metrics_updated_at,
       refresh_tier, next_refresh_at, author_avatar
     ) VALUES (?, ?, ?, NULL, 0, 'a post', 'en', ?, ?, ?, 0, 0, 0, 0, 0, ?, 'hot', ?, NULL)`,
  ).run(id, `a-${handle}`, handle, postedAt, postedAt, likes, postedAt, postedAt + HOUR)
  for (const skill of skills) {
    db().raw.prepare(
      `INSERT INTO x_post_skills (post_id, owner, repo, slug, canonical_name, skill_path, detection, matched_on, verified_at)
       VALUES (?, ?, ?, ?, ?, 'SKILL.md', 'slash', 'directory', ?)`,
    ).run(id, skill.owner, skill.repo, skill.slug, skill.slug, NOW)
  }
}

/** The scope a design track hands the loader: one category, one pin. */
function designScope(pins: string[] = []): TrendingScope {
  return {
    _tag: 'members',
    keep: candidates => findClusterCandidates(db().db, ['interface-design'], pins, candidates),
  }
}

describe('a track ranks only its own Skills', () => {
  it('admits the category under the abstract-or-indexable gate, and a pin', async () => {
    const abstract = seedSkill({ owner: 'a', slug: 'motion', category: 'interface-design', abstract: 1 })
    const indexable = seedSkill({ owner: 'b', slug: 'a11y', category: 'interface-design', abstract: 0, indexable: 1 })
    const ungated = seedSkill({ owner: 'c', slug: 'raw', category: 'interface-design', abstract: 0, indexable: 0 })
    const pinned = seedSkill({ owner: 'd', slug: 'picked', category: null })
    const elsewhere = seedSkill({ owner: 'e', slug: 'tdd', category: 'testing', abstract: 1 })
    for (const [i, skill] of [abstract, indexable, ungated, pinned, elsewhere].entries())
      post(`dev${i}`, [skill])

    const ranked = await loadTrendingSkills({ db: db().db, now: NOW, scope: designScope(['d/skills/picked']) })

    expect(ranked.map(skill => skill.slug).sort()).toEqual(['a11y', 'motion', 'picked'])
  })

  it('ranks by posts alone, so a star surge cannot enter a track', async () => {
    const surged = seedSkill({ owner: 'solo', repo: 'one', slug: 'one', category: 'interface-design', abstract: 1 })
    db().raw.prepare(
      `INSERT INTO repo_star_surges (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
       VALUES (?, ?, ?, 900, 5, 5000, ?)`,
    ).run(surged.owner, surged.repo, Math.floor((NOW - 86400) / 86400) * 86400, NOW - HOUR)

    expect(await loadTrendingSkills({ db: db().db, now: NOW, scope: designScope() })).toEqual([])
    // The board scope still counts the surge, so the narrowing is the track's.
    expect((await loadTrendingSkills({ db: db().db, now: NOW })).map(skill => skill.slug)).toEqual(['one'])
  })

  it('keeps a listicle diluted when only one of its Skills is in the track', async () => {
    const listed = seedSkill({ owner: 'a', slug: 'listed', category: 'interface-design', abstract: 1 })
    const dedicated = seedSkill({ owner: 'b', slug: 'dedicated', category: 'interface-design', abstract: 1 })
    const others = Array.from({ length: 9 }, (_, i) => seedSkill({ owner: `o${i}`, slug: `other-${i}`, category: 'testing', abstract: 1 }))
    // Two devs each post a list of ten; one dev posts about one Skill.
    post('lister1', [listed, ...others])
    post('lister2', [listed, ...others])
    post('fan', [dedicated])

    const ranked = await loadTrendingSkills({ db: db().db, now: NOW, scope: designScope() })

    expect(ranked.map(skill => skill.slug)).toEqual(['dedicated', 'listed'])
    expect(ranked[1]?.social?.authorWeight).toBeCloseTo(0.2)
  })

  it('answers for more candidates than one D1 statement can bind', async () => {
    const skills = Array.from({ length: 70 }, (_, i) =>
      seedSkill({ owner: `owner${i}`, slug: `skill-${i}`, category: i % 2 ? 'interface-design' : 'testing', abstract: 1 }))

    const kept = await findClusterCandidates(db().db, ['interface-design'], [], skills)

    expect(kept.size).toBe(35)
    expect(kept.has('owner1/skills/skill-1')).toBe(true)
    expect(kept.has('owner0/skills/skill-0')).toBe(false)
  })

  it('admits nothing for a track with no category and no pin', async () => {
    const skill = seedSkill({ owner: 'a', slug: 'motion', category: 'interface-design', abstract: 1 })

    expect((await findClusterCandidates(db().db, [], [], [skill])).size).toBe(0)
  })
})
