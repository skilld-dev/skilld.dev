import { afterEach, describe, expect, it } from 'vitest'
import { clusterMembersSql } from '../../layers/registry/server/utils/cluster-membership'
import { getGeneratedBatch } from '../../layers/registry/server/utils/skill-generated'
import { SKILLS_LEADERBOARD_COUNT_SQL, SKILLS_LEADERBOARD_PAGE_SQL } from '../../layers/registry/server/utils/skills-leaderboard'
import { queryAllSkillsForSitemap } from '../../layers/registry/server/utils/skills-registry'
import { COMMUNITY_DIRECTORY_SQL } from '../../server/utils/community'
import { RECENT_UPDATES_SQL } from '../../server/utils/recent-updates-query'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

/**
 * Each of these statements scanned a whole table in production until
 * migration 0123 gave it an index. A plan that falls back to `SCAN` on the
 * table reads every row again, on every call.
 */

const COLUMNS = 'owner, name, repo, display_name, stars, category, is_abstract'

let h: ReturnType<typeof createSqliteD1>

afterEach(() => h.close())

function plan(sql: string, bindings: unknown[]): string {
  const expanded: unknown[] = []
  const normalized = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(bindings[Number(raw) - 1])
    return '?'
  })
  const rows = h.raw.prepare(`EXPLAIN QUERY PLAN ${normalized}`).all(...(expanded.length ? expanded : bindings) as never[]) as { detail: string }[]
  return rows.map(row => row.detail).join('\n')
}

describe('d1 read query plans', () => {
  it('finds category members through the partial category index', () => {
    h = createSqliteD1(allMigrations())
    const { sql, params } = clusterMembersSql(COLUMNS, ['testing', 'ci-cd'], [])

    const detail = plan(sql, params)

    expect(detail).toContain('idx_skills_category_members')
    expect(detail).not.toMatch(/SCAN (s|r)\b/)
  })

  it('finds pinned skills through the owner, repo and name expression index', () => {
    h = createSqliteD1(allMigrations())
    const { sql, params } = clusterMembersSql(COLUMNS, [], ['acme/skills/deploy', 'acme/skills/review'])

    const detail = plan(sql, params)

    expect(detail).toContain('idx_skills_identity_path')
    expect(detail).not.toMatch(/SCAN s\b/)
  })

  it('joins community users to their skills without a skills scan', () => {
    h = createSqliteD1(allMigrations())

    const detail = plan(COMMUNITY_DIRECTORY_SQL, [])

    expect(detail).toContain('idx_skills_owner_nocase')
    expect(detail).not.toMatch(/SCAN s\b/)
  })

  it('seeks the newest update of each skill for the recent updates feed', () => {
    h = createSqliteD1(allMigrations())

    const detail = plan(RECENT_UPDATES_SQL, [0, 6, 72])

    expect(detail).toContain('idx_activity_skill_latest')
    expect(detail).not.toMatch(/SCAN (activity|latest)\b/)
  })

  it('covers loadLinkableRepoSkillNames via idx_skills_repo_resolved_name without table lookups or sort', () => {
    h = createSqliteD1(allMigrations())

    const detail = plan(
      'SELECT name FROM skills WHERE owner = ? AND repo = ? AND source_resolved = 1 ORDER BY name',
      ['acme', 'skills'],
    )

    expect(detail).toContain('COVERING INDEX idx_skills_repo_resolved_name')
    expect(detail).not.toContain('TEMP B-TREE')
  })

  it('seeks repo_star_surges by detected_at via idx_repo_star_surges_detected', () => {
    h = createSqliteD1(allMigrations())

    const detail = plan(
      `WITH surged_repos AS (
         SELECT DISTINCT owner, repo
         FROM repo_star_surges INDEXED BY idx_repo_star_surges_detected
         WHERE detected_at >= ?1
       ),
       single_skill_repos AS (
         SELECT s.owner, s.repo, MIN(s.name) AS slug, MIN(s.display_name) AS display_name
         FROM surged_repos
         CROSS JOIN skills s ON s.owner = surged_repos.owner AND s.repo = surged_repos.repo
         WHERE s.source_resolved = 1
         GROUP BY s.owner, s.repo
         HAVING COUNT(*) = 1
       )
       SELECT r.owner, r.repo, r.slug, g.latest_gain
       FROM repo_star_surges g
       JOIN single_skill_repos r ON r.owner = g.owner AND r.repo = g.repo
       WHERE g.detected_at >= ?1`,
      [1_700_000_000],
    )

    expect(detail).toContain('idx_repo_star_surges_detected')
    expect(detail).not.toContain('SCAN repo_star_surges')
  })

  it('drives recent-publishes from idx_activity_home_feed without sorting all official history', () => {
    h = createSqliteD1(allMigrations())

    const detail = plan(
      `SELECT a.owner, a.name, a.occurred_at
       FROM activity a
       CROSS JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
       CROSS JOIN repos r ON r.owner = a.owner AND r.repo = a.repo
       WHERE a.type = 'skill_published'
         AND a.owner IN (SELECT value FROM json_each(?))
       ORDER BY a.occurred_at DESC
       LIMIT 12`,
      ['["anthropics","nuxt"]'],
    )

    expect(detail).toContain('idx_activity_home_feed')
    expect(detail).not.toContain('TEMP B-TREE FOR ORDER BY')
  })

  it('drives leaderboard page and count queries from skill_repo_eligibility without scanning repos', () => {
    h = createSqliteD1(allMigrations())

    const pagePlan = plan(SKILLS_LEADERBOARD_PAGE_SQL, [50, 0])
    expect(pagePlan).toContain('idx_skill_repo_eligibility_status')
    expect(pagePlan).not.toContain('repos_broken_idx')

    const countPlan = plan(SKILLS_LEADERBOARD_COUNT_SQL, [])
    expect(countPlan).toContain('idx_skill_repo_eligibility_status')
    expect(countPlan).not.toContain('repos_broken_idx')
    expect(countPlan).not.toContain('TEMP B-TREE FOR ORDER BY')
  })

  it('seeks skill_generated primary key in getGeneratedBatch instead of scanning all rows of a kind', async () => {
    h = createSqliteD1(allMigrations())
    h.raw.prepare(`
      INSERT INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at)
      VALUES ('acme', 'tools', 'one', 'tags', 'sha1', '{"tags":["vue"]}', '2026-10-01T00:00:00Z'),
             ('acme', 'tools', 'two', 'tags', 'sha2', '{"tags":["nuxt"]}', '2026-10-01T00:00:00Z')
    `).run()

    const detail = plan(
      `SELECT * FROM skill_generated WHERE (owner, repo, name) IN (VALUES (?, ?, ?), (?, ?, ?)) AND kind = ?`,
      ['acme', 'tools', 'one', 'acme', 'tools', 'two', 'tags'],
    )
    expect(detail).toContain('sqlite_autoindex_skill_generated_1')
    expect(detail).not.toContain('idx_skill_generated_kind')

    const map = await getGeneratedBatch<{ tags: string[] }>(
      h.db,
      [{ owner: 'acme', repo: 'tools', name: 'one' }],
      'tags',
    )
    expect(map.get('acme/tools/one')?.payload).toEqual({ tags: ['vue'] })
    expect(map.size).toBe(1)
  })

  it('counts active X refresh tiers via partial index idx_x_posts_refresh', () => {
    h = createSqliteD1(allMigrations())

    const detail = plan(
      `SELECT refresh_tier, COUNT(*) AS n FROM x_posts WHERE platform = 'x' AND refresh_tier != 'frozen' GROUP BY refresh_tier`,
      [],
    )

    expect(detail).toContain('idx_x_posts_refresh')
    expect(detail).not.toContain('SCAN x_posts')
  })

  it('returns admitted and probe-exception skills from queryAllSkillsForSitemap when admissions are populated', async () => {
    h = createSqliteD1(allMigrations())
    h.raw.exec(`
      INSERT INTO repos (owner, repo, stars, repo_kind) VALUES ('acme', 'tools', 100, 'creator'), ('agg', 'dump', 500, 'aggregator');
      INSERT INTO skills (owner, repo, name, display_name, slug, seo_indexable, source_resolved, current_sha)
      VALUES
        ('acme', 'tools', 'admitted', 'Admitted', 'acme/admitted', 1, 1, 'sha-1'),
        ('acme', 'tools', 'unadmitted', 'Unadmitted', 'acme/unadmitted', 1, 1, 'sha-2'),
        ('acme', 'tools', 'probe-only', 'Probe Only', 'acme/probe-only', 0, 1, 'sha-3'),
        ('agg', 'dump', 'agg-skill', 'Agg', 'agg/agg-skill', 1, 1, 'sha-4');
      INSERT INTO skill_trending_admissions (owner, repo, name, admitted_at, first_board)
      VALUES
        ('acme', 'tools', 'admitted', 1000, 'week'),
        ('acme', 'tools', 'probe-only', 1000, 'probe'),
        ('agg', 'dump', 'agg-skill', 1000, 'week');
    `)

    const entries = await queryAllSkillsForSitemap(h.db)
    expect(entries).toEqual([
      { name: 'admitted', owner: 'acme', repo: 'tools', repoSkillCount: 3, revision: 'sha-1' },
      { name: 'probe-only', owner: 'acme', repo: 'tools', repoSkillCount: 3, revision: 'sha-3' },
    ])
  })
})
