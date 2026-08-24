import { describe, expect, it } from 'vitest'
import { canonicalRepoSkillPath, repoSkillPath } from '../../layers/registry/app/utils/skill-routes'

describe('repoSkillPath', () => {
  it('always identifies the exact Skill', () => {
    expect(repoSkillPath('ericzakariasson', 'scandinavian-design', 'scandinavian-design'))
      .toBe('/gh/ericzakariasson/scandinavian-design/scandinavian-design')
  })
})

describe('canonicalRepoSkillPath', () => {
  it('uses the repository URL when the repository has one resolved Skill', () => {
    expect(canonicalRepoSkillPath({
      owner: 'ericzakariasson',
      repo: 'scandinavian-design',
      name: 'scandinavian-design',
      repoSkillCount: 1,
    }))
      .toBe('/gh/ericzakariasson/scandinavian-design')
  })

  it('keeps the Skill segment when the repository has several resolved Skills', () => {
    expect(canonicalRepoSkillPath({
      owner: 'anthropics',
      repo: 'skills',
      name: 'pdf-processing',
      repoSkillCount: 9,
    }))
      .toBe('/gh/anthropics/skills/pdf-processing')
  })
})
