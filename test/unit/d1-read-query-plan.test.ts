import { afterEach, describe, expect, it } from 'vitest'
import { clusterMembersSql } from '../../layers/registry/server/utils/cluster-membership'
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

    expect(detail).toContain('idx_skills_owner_repo_name_key')
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
})
