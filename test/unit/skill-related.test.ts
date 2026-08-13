import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { clampSemanticTopK } from '../../layers/registry/server/utils/skill-semantic-search'

const skillDetailSource = readFileSync('layers/registry/app/components/SkillDetail.vue', 'utf8')

describe('related skills', () => {
  it('keeps metadata-rich Vectorize queries within the provider limit', () => {
    expect(clampSemanticTopK(200)).toBe(50)
    expect(clampSemanticTopK(12)).toBe(12)
    expect(clampSemanticTopK(0)).toBe(1)
  })

  it('leads the related section with similar skills', () => {
    expect(skillDetailSource).toContain('const relatedTab = ref<string>(\'similar\')')
    expect(skillDetailSource.indexOf('label: \'Similar\''))
      .toBeLessThan(skillDetailSource.indexOf('label: `From ${data.value?.owner'))
  })
})
