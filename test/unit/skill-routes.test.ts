import { describe, expect, it } from 'vitest'
import { repoSkillPath } from '../../layers/registry/app/utils/skill-routes'

describe('repoSkillPath', () => {
  it('uses the repository URL when the repository has one Skill', () => {
    expect(repoSkillPath('ericzakariasson', 'scandinavian-design', 'scandinavian-design', 1))
      .toBe('/gh/ericzakariasson/scandinavian-design')
  })

  it('keeps the Skill segment when the repository has several Skills', () => {
    expect(repoSkillPath('anthropics', 'skills', 'pdf-processing', 9))
      .toBe('/gh/anthropics/skills/pdf-processing')
  })
})
