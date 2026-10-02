// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { githubSkillFileUrl } from '#shared/skill-file-url'

describe('githubSkillFileUrl', () => {
  it('links the file at the default branch', () => {
    expect(githubSkillFileUrl({
      owner: 'hyf0',
      repo: 'vue-skills',
      skillPath: 'skills/vue-testing-best-practices/SKILL.md',
      branch: 'canary',
    })).toBe('https://github.com/hyf0/vue-skills/blob/canary/skills/vue-testing-best-practices/SKILL.md')
  })

  it('links HEAD when the branch is unknown', () => {
    expect(githubSkillFileUrl({ owner: 'a', repo: 'b', skillPath: 'SKILL.md', branch: null }))
      .toBe('https://github.com/a/b/blob/HEAD/SKILL.md')
  })

  it('encodes path segments without encoding the separators', () => {
    expect(githubSkillFileUrl({
      owner: 'a',
      repo: 'b',
      skillPath: 'skills/with space/#1/SKILL.md',
      branch: 'main',
    })).toBe('https://github.com/a/b/blob/main/skills/with%20space/%231/SKILL.md')
  })

  it.each([
    ['no path', { skillPath: null }],
    ['empty path', { skillPath: '' }],
  ])('returns null with %s', (_, partial) => {
    expect(githubSkillFileUrl({ owner: 'a', repo: 'b', branch: 'main', ...partial })).toBeNull()
  })
})
