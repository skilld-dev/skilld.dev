import { describe, expect, it } from 'vitest'
import { curateClusterSkills, parseClusterSkillKeys } from '../../layers/registry/server/utils/cluster-skill-curation'

const skills = [
  { owner: 'mattpocock', repo: 'skills', name: 'wait-what' },
  { owner: 'mattpocock', repo: 'skills', name: 'batch-grill-me' },
  { owner: 'mattpocock', repo: 'skills', name: 'writing-great-skills' },
  { owner: 'emilkowalski', repo: 'skills', name: 'animation-vocabulary' },
  { owner: 'dylantarre', repo: 'animation-principles', name: 'web-motion-design' },
  { owner: 'simota', repo: 'agent-skills', name: 'palette' },
]

describe('cluster skill curation', () => {
  it('leads with three hand-picked skills from distinct authors', () => {
    const result = curateClusterSkills(skills, [
      'emilkowalski/skills/animation-vocabulary',
      'dylantarre/animation-principles/web-motion-design',
      'simota/agent-skills/palette',
    ])

    expect(result.slice(0, 3)).toEqual(skills.slice(3))
  })

  it('uses another author before repeating a pinned author', () => {
    const result = curateClusterSkills(skills, [
      'mattpocock/skills/wait-what',
      'mattpocock/skills/batch-grill-me',
      'emilkowalski/skills/animation-vocabulary',
      'dylantarre/animation-principles/web-motion-design',
    ])

    expect(result.slice(0, 3).map(skill => skill.owner)).toEqual([
      'mattpocock',
      'emilkowalski',
      'dylantarre',
    ])
  })

  it('leads with the pinned repository, not a namesake in another one', () => {
    const twin = { owner: 'emilkowalski', repo: 'skill', name: 'emil-design-eng' }
    const pick = { owner: 'emilkowalski', repo: 'skills', name: 'emil-design-eng' }

    expect(curateClusterSkills([twin, pick], ['emilkowalski/skills/emil-design-eng'])[0]).toBe(pick)
  })

  it.each(['emilkowalski/emil-design-eng', 'emilkowalski//emil-design-eng', 'a/b/c/d'])('refuses the pin key %s', (key) => {
    expect(() => parseClusterSkillKeys([key])).toThrow('expected owner/repo/name')
  })
})
