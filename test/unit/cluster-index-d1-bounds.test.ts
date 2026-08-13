import { describe, expect, it, vi } from 'vitest'
import { findClusterIndexRows } from '../../layers/registry/server/utils/cluster-index-rows'

interface TestRow {
  owner: string
  repo: string
  name: string
}

describe('findClusterIndexRows', () => {
  it('finds categories and pinned skills without exceeding the D1 parameter limit', async () => {
    const shared = { owner: 'shared', repo: 'skills', name: 'shared' }
    const query = vi.fn(async (selector: 'category' | 'pinned', values: string[]): Promise<TestRow[]> => {
      if (values.length > 100)
        throw new Error('D1_ERROR: too many SQL variables')

      return selector === 'category'
        ? [shared, { owner: 'category', repo: 'skills', name: 'category' }]
        : [shared, ...values.map(name => ({ owner: 'pinned', repo: 'skills', name }))]
    })
    const pinned = Array.from({ length: 101 }, (_, index) => `skill-${index}`)

    const rows = await findClusterIndexRows(query, ['framework'], pinned)

    expect(rows).toHaveLength(103)
    expect(query.mock.calls.map(([, values]) => values.length)).toEqual([1, 100, 1])
  })
})
