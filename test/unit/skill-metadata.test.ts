import { describe, expect, it } from 'vitest'
import { partitionMetadataEntries } from '../../layers/registry/app/utils/skill-metadata'

describe('skill metadata', () => {
  it('shows three short values and discloses long and overflow values', () => {
    const entries = [
      { key: 'version', value: '1.117.4', complex: false },
      { key: 'author', value: 'Baoyu', complex: false },
      { key: 'notes', value: 'x'.repeat(81), complex: false },
      { key: 'category', value: 'comic', complex: false },
      { key: 'language', value: 'Chinese', complex: false },
    ]

    const result = partitionMetadataEntries(entries)

    expect(result).toEqual({
      visible: [entries[0], entries[1], entries[3]],
      other: [entries[2], entries[4]],
    })
  })
})
