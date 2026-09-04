// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { githubSkillFileUrl } from '#shared/skill-file-url'

describe('githubSkillFileUrl', () => {
  it('pins the blob to the synced commit', () => {
    expect(githubSkillFileUrl({
      owner: 'hyf0',
      repo: 'vue-skills',
      skillPath: 'skills/vue-testing-best-practices/SKILL.md',
      ref: 'bc922e4a1f',
    })).toBe('https://github.com/hyf0/vue-skills/blob/bc922e4a1f/skills/vue-testing-best-practices/SKILL.md')
  })

  it('encodes path segments without encoding the separators', () => {
    expect(githubSkillFileUrl({
      owner: 'a',
      repo: 'b',
      skillPath: 'skills/with space/#1/SKILL.md',
      ref: 'main',
    })).toBe('https://github.com/a/b/blob/main/skills/with%20space/%231/SKILL.md')
  })

  it.each([
    ['no path', { skillPath: null, ref: 'main' }],
    ['empty path', { skillPath: '', ref: 'main' }],
    ['no ref', { skillPath: 'SKILL.md', ref: null }],
  ])('returns null with %s', (_, partial) => {
    expect(githubSkillFileUrl({ owner: 'a', repo: 'b', ...partial })).toBeNull()
  })
})
