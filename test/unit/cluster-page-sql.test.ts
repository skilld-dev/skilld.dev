import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { CLUSTERS } from '../../layers/registry/server/data/clusters'
import { clusterPageSql, D1_BOUND_PARAMETER_LIMIT } from '../../layers/registry/server/utils/cluster-membership'
import { parseClusterSkillKeys } from '../../layers/registry/server/utils/cluster-skill-curation'

const COLUMNS = 'owner, name, repo, display_name, description, stars, modified_at, is_abstract'

/**
 * `/api/clusters/<slug>` sends two statements built from the membership
 * fragment, and the fragment is not what D1 counts. The list statement binds
 * every pinned key three times: once for the SELECT `CASE`, once for the WHERE
 * arm, and twice more for the ORDER BY `CASE`, plus limit and offset. Guarding
 * only the fragment let SKILLD-X reach production at 173 events.
 */
describe('cluster page sql', () => {
  it('binds one param per placeholder in both statements', () => {
    const page = clusterPageSql(COLUMNS, ['testing'], parseClusterSkillKeys(['obra/tdd']), { limit: 60, offset: 0 })

    expect(page.countSql.match(/\?/g)).toHaveLength(page.countParams.length)
    expect(page.listSql.match(/\?/g)).toHaveLength(page.listParams.length)
  })

  it('orders pinned skills ahead of the star ranking', () => {
    const page = clusterPageSql(COLUMNS, [], parseClusterSkillKeys(['obra/tdd', 'shadcn/shadcn']), { limit: 10, offset: 20 })

    expect(page.listParams.slice(0, 4)).toEqual(['obra', 'tdd', 'shadcn', 'shadcn'])
    expect(page.listParams.slice(-2)).toEqual([10, 20])
  })

  it('drops the pinned ORDER BY arm when a cluster has no pins', () => {
    const page = clusterPageSql(COLUMNS, ['testing'], [], { limit: 60, offset: 0 })

    expect(page.listSql).not.toContain('WHEN owner = ?')
    expect(page.listParams).toEqual(['testing', 60, 0])
  })

  it('pages pinned skills first and counts only resolved skills per repo', () => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec(`
        CREATE TABLE repos (owner TEXT, repo TEXT, stars INTEGER, PRIMARY KEY (owner, repo));
        CREATE TABLE skills (
          owner TEXT, repo TEXT, name TEXT, display_name TEXT, description TEXT,
          modified_at INTEGER, abstractness_category TEXT, is_abstract INTEGER,
          seo_indexable INTEGER, source_resolved INTEGER,
          PRIMARY KEY (owner, repo, name)
        );
        INSERT INTO repos VALUES ('big', 'mono', 900), ('obra', 'skills', 50), ('solo', 'one', 10);
        INSERT INTO skills VALUES
          ('big', 'mono', 'a', 'A', NULL, 1, 'testing', 0, 1, 1),
          ('big', 'mono', 'b', 'B', NULL, 1, 'testing', 0, 1, 1),
          ('big', 'mono', 'gone', 'Gone', NULL, 1, 'testing', 0, 0, 0),
          ('obra', 'skills', 'tdd', 'TDD', NULL, 1, 'other', 0, 0, 1),
          ('solo', 'one', 'c', 'C', NULL, 1, 'testing', 1, 0, 1);
      `)
      const page = clusterPageSql(COLUMNS, ['testing'], parseClusterSkillKeys(['obra/tdd']), { limit: 3, offset: 0 })
      const rows = sqlite.prepare(page.listSql).all(...page.listParams) as { owner: string, name: string, repo_skill_count: number }[]

      expect(rows.map(row => [`${row.owner}/${row.name}`, row.repo_skill_count])).toEqual([
        ['obra/tdd', 1],
        ['solo/c', 1],
        ['big/a', 2],
      ])
      expect(sqlite.prepare(page.countSql).get(...page.countParams)).toEqual({ n: 4 })
    }
    finally {
      sqlite.close()
    }
  })

  it('keeps every live cluster page under the D1 parameter cap', () => {
    for (const cluster of CLUSTERS) {
      const page = clusterPageSql(
        COLUMNS,
        cluster.categories,
        parseClusterSkillKeys(cluster.pinnedExamples),
        { limit: 120, offset: 0 },
      )

      expect(page.countParams.length, `${cluster.slug} count`).toBeLessThanOrEqual(D1_BOUND_PARAMETER_LIMIT)
      expect(page.listParams.length, `${cluster.slug} list`).toBeLessThanOrEqual(D1_BOUND_PARAMETER_LIMIT)
    }
  })
})
