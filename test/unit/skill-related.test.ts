import { describe, expect, it } from 'vitest'
import { clampSemanticTopK } from '../../layers/registry/server/utils/skill-semantic-search'

describe('related skills', () => {
  it('keeps metadata-rich Vectorize queries within the provider limit', () => {
    expect(clampSemanticTopK(200)).toBe(50)
    expect(clampSemanticTopK(12)).toBe(12)
    expect(clampSemanticTopK(0)).toBe(1)
  })
})
