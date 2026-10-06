import { describe, expect, it } from 'vitest'
import { groupDemos } from '../../shared/demo-groups'

describe('groupDemos', () => {
  it('puts demos under their group in page order and leaves empty groups out', () => {
    const groups = groupDemos([
      { name: 'diagram-design', makes: 'diagram' as const },
      { name: 'brag', makes: 'film' as const },
      { name: 'show-me', makes: 'diagram' as const },
    ])
    expect(groups.map(group => [group.label, group.demos.map(demo => demo.name)])).toEqual([
      ['Films and launch videos', ['brag']],
      ['Diagrams and explainers', ['diagram-design', 'show-me']],
    ])
  })
})
