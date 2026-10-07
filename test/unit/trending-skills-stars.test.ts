import { describe, expect, it } from 'vitest'
import { loadTrendingSkills } from '../../shared/server/trending-skills'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_760_000_000

describe('repository stars on trending skills', () => {
  it('carries the repository star count onto each listed skill', async () => {
    const h = createSqliteD1(allMigrations())
    h.raw.prepare(`INSERT INTO repos (owner, repo, stars) VALUES ('obra','superpowers',266025)`).run()
    h.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path)
       VALUES ('obra','superpowers','brainstorming','brainstorming','brainstorming',1,'brainstorming/SKILL.md')`,
    ).run()
    h.raw.prepare(
      `INSERT INTO repo_star_surges (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
       VALUES ('obra','superpowers', ${Math.floor((NOW - 86400) / 86400) * 86400}, 900, 10, 266025, ${NOW - 86400})`,
    ).run()

    const out = await loadTrendingSkills({ db: h.db, now: NOW })
    expect(out).toHaveLength(1)
    expect(out[0]!.stars).toBe(266025)
    h.close()
  })

  it('leaves stars null when the repository is unknown', async () => {
    const h = createSqliteD1(allMigrations())
    h.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path)
       VALUES ('ghost','repo','x','x','x',1,'x/SKILL.md')`,
    ).run()
    h.raw.prepare(`INSERT INTO repos (owner, repo, stars) VALUES ('ghost','repo',0)`).run()
    h.raw.prepare(
      `INSERT INTO repo_star_surges (owner, repo, observed_day, latest_gain, baseline_gain, stars, detected_at)
       VALUES ('ghost','repo', ${Math.floor((NOW - 86400) / 86400) * 86400}, 50, 1, 0, ${NOW - 86400})`,
    ).run()
    const out = await loadTrendingSkills({ db: h.db, now: NOW })
    expect(out[0]!.stars).toBe(0)
    h.close()
  })
})

describe('listicle dilution', () => {
  it('ranks a specific post above a skill that only appeared in a long list', async () => {
    const h = createSqliteD1(allMigrations())
    const seedSkill = (owner: string, repo: string, name: string) => {
      h.raw.prepare(`INSERT OR IGNORE INTO repos (owner, repo, stars) VALUES (?,?,0)`).run(owner, repo)
      h.raw.prepare(
        `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path)
         VALUES (?,?,?,?,?,1,?)`,
      ).run(owner, repo, name, name, name, `${name}/SKILL.md`)
    }
    const seedPost = (id: string, handle: string, likes: number) => {
      h.raw.prepare(
        `INSERT INTO x_posts (post_id, platform, author_id, author_handle, author_name, author_followers,
           text_extract, lang, posted_at, first_seen_at, favourite_count, repost_count, reply_count,
           quote_count, bookmark_count, impression_count, metrics_updated_at, refresh_tier, next_refresh_at)
         VALUES (?, 'x', ?, ?, 'n', 0, 'text', 'en', ?, ?, ?, 0,0,0,0,0, ?, 'frozen', 0)`,
      ).run(id, `did:${handle}`, handle, NOW - 3600, NOW - 3600, likes, NOW)
    }
    const link = (postId: string, owner: string, repo: string, name: string) =>
      h.raw.prepare(
        `INSERT INTO x_post_skills (post_id, owner, repo, slug, canonical_name, skill_path, detection, matched_on, verified_at)
         VALUES (?,?,?,?,?,?, 'prose','registry', ?)`,
      ).run(postId, owner, repo, name, name, `${name}/SKILL.md`, NOW)

    // One listicle naming five skills, and one dedicated post at high engagement.
    seedPost('listicle', 'lister', 30)
    for (const n of ['a', 'b', 'c', 'd', 'listed']) {
      seedSkill('owner', 'repo', n)
      link('listicle', 'owner', 'repo', n)
    }
    seedSkill('solo', 'repo', 'specific')
    seedPost('dedicated', 'fan', 911)
    link('dedicated', 'solo', 'repo', 'specific')

    const out = await loadTrendingSkills({ db: h.db, now: NOW })
    expect(out[0]!.slug).toBe('specific')
    h.close()
  })
})
