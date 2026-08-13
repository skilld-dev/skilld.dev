import { describe, expect, it } from 'vitest'
import { parseRepoSkillSort, sortRepoSkills } from '../../layers/registry/app/utils/repo-skill-layout'

const skills = [
  { name: 'alpha', firstSeenAt: 100, modifiedAt: 400 },
  { name: 'bravo', firstSeenAt: null, modifiedAt: 300 },
  { name: 'charlie', firstSeenAt: 300, modifiedAt: null },
]

describe('repository skill layout', () => {
  it('parses supported sort queries and defaults invalid values to recently updated', () => {
    expect(parseRepoSkillSort('added')).toBe('added')
    expect(parseRepoSkillSort('name')).toBe('name')
    expect(parseRepoSkillSort(['added'])).toBe('updated')
    expect(parseRepoSkillSort('unknown')).toBe('updated')
  })

  it('sorts newest first and keeps missing dates last', () => {
    expect(sortRepoSkills(skills, 'added').map(skill => skill.name)).toEqual(['charlie', 'alpha', 'bravo'])
    expect(sortRepoSkills(skills, 'updated').map(skill => skill.name)).toEqual(['alpha', 'bravo', 'charlie'])
  })

  it('sorts names without mutating the source array', () => {
    const original = [...skills]

    expect(sortRepoSkills(skills, 'name').map(skill => skill.name)).toEqual(['alpha', 'bravo', 'charlie'])
    expect(skills).toEqual(original)
  })
})
