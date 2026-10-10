import { describe, expect, it } from 'vitest'
import { validateSkillFrontmatter } from '../../shared/skill-validation'

const valid = '---\nname: example\ndescription: Convert HTML when a task needs Markdown.\n---\nInstructions'

describe('skill frontmatter validation', () => {
  it('accepts omitted optional fields and decoded YAML scalars', () => {
    expect(validateSkillFrontmatter(valid, 'skills/example/SKILL.md', 'repo')).toEqual([])
    expect(validateSkillFrontmatter(valid.replace('---\nInstructions', `metadata:\n  version: "1"\nallowed-tools: Read Bash(git:*)\ncompatibility: "${'😀'.repeat(500)}"\n---\nInstructions`), 'skills/example/SKILL.md', 'repo')).toEqual([])
  })

  it.each([
    ['name: example\nname: duplicate', 'yaml'],
    ['name: [', 'yaml'],
    ['name: example\ndescription: true', 'description'],
    ['name: Example\ndescription: Works.', 'name'],
    ['name: example\ndescription: Works.\nmetadata:\n  version: 1', 'metadata'],
    ['name: example\ndescription: Works.\nmetadata:\n  1: value', 'metadata'],
    ['name: example\ndescription: Works.\nallowed-tools: [Read]', 'allowed-tools'],
    ['name: example\ndescription: Works.\nuser_invocable: true', 'user_invocable'],
    ['name: example\ndescription: Works.\nversion: "1"', 'version'],
    ['name: example\ndescription: Works.\ncompatibility: ""', 'compatibility'],
  ])('reports actionable invalid metadata: %s', (frontmatter, field) => {
    const result = validateSkillFrontmatter(`---\n${frontmatter}\n---\nInstructions`, 'skills/example/SKILL.md', 'repo')
    expect(result.some(issue => issue.field === field && issue.severity === 'error')).toBe(true)
  })

  it('reports missing frontmatter and a mismatched folder', () => {
    expect(validateSkillFrontmatter('Instructions', 'skills/example/SKILL.md', 'repo')[0]?.field).toBe('frontmatter')
    expect(validateSkillFrontmatter(valid, 'skills/different/SKILL.md', 'repo')).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'name' })]))
  })

  it('keeps documented Claude Code extensions as portability notices', () => {
    const result = validateSkillFrontmatter(valid.replace('---\nInstructions', 'context: fork\nagent: Explore\nuser-invocable: false\n---\nInstructions'), 'skills/example/SKILL.md', 'repo')
    expect(result.filter(issue => issue.severity === 'error')).toEqual([])
    expect(result).toEqual([expect.objectContaining({ field: 'claude-code', severity: 'notice' })])
  })

  it('counts Unicode characters and treats long instructions as guidance', () => {
    expect(validateSkillFrontmatter(valid.replace('Convert HTML when a task needs Markdown.', '😀'.repeat(1024)), 'skills/example/SKILL.md', 'repo')).toEqual([])
    expect(validateSkillFrontmatter(`${valid}\n${'Line\n'.repeat(500)}`, 'skills/example/SKILL.md', 'repo')).toEqual([expect.objectContaining({ field: 'body', severity: 'notice' })])
  })

  it('normalizes Unicode names before checking naming constraints', () => {
    expect(validateSkillFrontmatter(valid.replace('name: example', 'name: ｅｘａｍｐｌｅ'), 'skills/example/SKILL.md', 'repo')).toEqual([])
    expect(validateSkillFrontmatter(valid.replace('name: example', `name: ${'ﬀ'.repeat(40)}`), `skills/${'ﬀ'.repeat(40)}/SKILL.md`, 'repo')).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'name' })]))
  })
})
