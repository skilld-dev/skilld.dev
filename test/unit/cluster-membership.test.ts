import { describe, expect, it } from 'vitest'
import { CLUSTERS } from '../../layers/registry/server/data/clusters'
import { clusterMembersSql } from '../../layers/registry/server/utils/cluster-membership'

/**
 * D1 binds `?` by position in the statement text and rejects a statement with
 * more than 100 of them. Both are silent-wrong-answer failures rather than
 * crashes: swapped params return the wrong skills for the wrong track.
 */
describe('cluster membership sql', () => {
  it('binds one param per placeholder, in statement order', () => {
    const { sql, params } = clusterMembersSql('owner, name', ['testing', 'observability'], ['obra/skills/tdd'])

    expect(sql.match(/\?/g)).toHaveLength(params.length)
    // The pinned CASE sits in the SELECT list, ahead of both WHERE arms.
    expect(params).toEqual(['obra/skills/tdd', 'testing', 'observability', 'obra/skills/tdd'])
  })

  it('skips the pinned CASE when nothing else can match', () => {
    const { sql, params } = clusterMembersSql('owner, name', [], ['obra/skills/tdd', 'mattpocock/skills/tdd'])

    expect(params).toEqual(['obra/skills/tdd', 'mattpocock/skills/tdd'])
    expect(sql).not.toContain('CASE')
    expect(sql.match(/\?/g)).toHaveLength(2)
  })

  it('keeps every live category under the D1 parameter cap', () => {
    for (const cluster of CLUSTERS) {
      const { params } = clusterMembersSql('owner', cluster.categories, cluster.pinnedExamples)
      expect(params.length, cluster.slug).toBeLessThanOrEqual(100)
    }
  })

  it('refuses a query with no terms rather than emitting `IN ()`', () => {
    expect(() => clusterMembersSql('owner', [], [])).toThrow()
  })
})
