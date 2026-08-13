import { describe, expect, it } from 'vitest'
import { curateClusterSkills } from '../../layers/registry/server/utils/cluster-skill-curation'

const skills = [
  { owner: 'mattpocock', name: 'wait-what' },
  { owner: 'mattpocock', name: 'batch-grill-me' },
  { owner: 'mattpocock', name: 'writing-great-skills' },
  { owner: 'emilkowalski', name: 'animation-vocabulary' },
  { owner: 'dylantarre', name: 'web-motion-design' },
  { owner: 'simota', name: 'palette' },
]

describe('cluster skill curation', () => {
  it('leads with three hand-picked skills from distinct authors', () => {
    const result = curateClusterSkills(skills, [
      'emilkowalski/animation-vocabulary',
      'dylantarre/web-motion-design',
      'simota/palette',
    ])

    expect(result.slice(0, 3)).toEqual(skills.slice(3))
  })

  it('uses another author before repeating a pinned author', () => {
    const result = curateClusterSkills(skills, [
      'mattpocock/wait-what',
      'mattpocock/batch-grill-me',
      'emilkowalski/animation-vocabulary',
      'dylantarre/web-motion-design',
    ])

    expect(result.slice(0, 3).map(skill => skill.owner)).toEqual([
      'mattpocock',
      'emilkowalski',
      'dylantarre',
    ])
  })
})
