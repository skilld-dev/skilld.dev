import { describe, expect, it } from 'vitest'
import { groupRepoSkills, hasRepoFolderGrouping } from '../../layers/registry/app/utils/repo-skill-groups'

const skills = [
  { name: 'tdd' },
  { name: 'grill-me' },
  { name: 'write-a-skill' },
  { name: 'removed-from-tree' },
]

describe('repository skill grouping', () => {
  it('groups skills by source parent folder and keeps unmatched skills visible', () => {
    expect(groupRepoSkills(skills, [
      'skills/engineering/tdd/SKILL.md',
      'skills/productivity/grill-me/SKILL.md',
      'write-a-skill/SKILL.md',
    ])).toEqual([
      { key: 'engineering', label: 'Engineering', skills: [skills[0]] },
      { key: 'productivity', label: 'Productivity', skills: [skills[1]] },
      { key: 'skills', label: 'Skills', skills: [skills[2]] },
      { key: 'other', label: 'Other', skills: [skills[3]] },
    ])
  })

  it('matches source folder names case-insensitively and formats labels', () => {
    const inProgress = { name: 'Wizard' }

    expect(groupRepoSkills([inProgress], [
      'skills/in-progress/wizard/SKILL.md',
    ])).toEqual([
      { key: 'in-progress', label: 'In progress', skills: [inProgress] },
    ])
  })

  it('orders deprecated and unmatched groups last', () => {
    const deprecated = { name: 'legacy' }
    const engineering = { name: 'implement' }
    const unmatched = { name: 'missing' }

    expect(groupRepoSkills([deprecated, engineering, unmatched], [
      'skills/deprecated/legacy/SKILL.md',
      'skills/engineering/implement/SKILL.md',
    ]).map(group => group.key)).toEqual([
      'engineering',
      'deprecated',
      'other',
    ])
  })

  it('only enables folder presentation when a real folder was resolved', () => {
    expect(hasRepoFolderGrouping([
      { key: 'other', label: 'Other', skills },
    ])).toBe(false)

    expect(hasRepoFolderGrouping([
      { key: 'engineering', label: 'Engineering', skills: [skills[0]] },
      { key: 'other', label: 'Other', skills: skills.slice(1) },
    ])).toBe(true)
  })
})
