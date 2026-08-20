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

    expect(page.listParams.slice(-6)).toEqual(['obra', 'tdd', 'shadcn', 'shadcn', 10, 20])
  })

  it('drops the pinned ORDER BY arm when a cluster has no pins', () => {
    const page = clusterPageSql(COLUMNS, ['testing'], [], { limit: 60, offset: 0 })

    expect(page.listSql).not.toContain('WHEN owner = ?')
    expect(page.listParams).toEqual(['testing', 60, 0])
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
