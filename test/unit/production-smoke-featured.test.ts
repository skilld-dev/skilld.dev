import { describe, expect, it } from 'vitest'
import { featuredCollectionPaths } from '../../scripts/lib/production-smoke'

describe('featuredCollectionPaths', () => {
  it('builds the path the homepage links for each collection', () => {
    expect(featuredCollectionPaths({
      items: [
        { authorLogin: 'harlan-zw', slug: 'agent-building-stack' },
        { authorLogin: 'harlan-zw', slug: 'agent-workflow-stack' },
      ],
    })).toEqual(['/@harlan-zw/agent-building-stack', '/@harlan-zw/agent-workflow-stack'])
  })

  it('drops rows with no login or slug rather than building a broken path', () => {
    expect(featuredCollectionPaths({
      items: [{ authorLogin: 'harlan-zw' }, { slug: 'orphan' }, { authorLogin: '', slug: '' }],
    })).toEqual([])
  })

  it('returns nothing when the payload is not a collection list', () => {
    expect(featuredCollectionPaths(null)).toEqual([])
    expect(featuredCollectionPaths({ items: 'nope' })).toEqual([])
  })
})
