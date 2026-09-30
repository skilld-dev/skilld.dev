import { describe, expect, it } from 'vitest'
import { featuredCollectionPaths } from '../../scripts/lib/production-smoke'

describe('featuredCollectionPaths', () => {
  it('builds the path the homepage links for each collection', () => {
    expect(featuredCollectionPaths({
      items: [
        { authorLogin: 'harlan-zw', slug: 'essentials' },
        { authorLogin: 'harlan-zw', slug: 'vue-nuxt' },
      ],
    })).toEqual(['/@harlan-zw/essentials', '/@harlan-zw/vue-nuxt'])
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
