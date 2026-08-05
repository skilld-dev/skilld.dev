import { describe, expect, it } from 'vitest'
import { goneSkillKeys, skillKeyFromPath } from '../../server/utils/source-gone-skills'

const microsoft = {
  owner: 'microsoft',
  repo: 'skills',
  name: 'entra-app-registration',
  slug: 'microsoft/entra-app-registration',
  name_collides_with_repo: 0,
}

describe('skillKeyFromPath', () => {
  it('reads the flat slug a skill answers on', () => {
    expect(skillKeyFromPath('/gh/microsoft/entra-app-registration'))
      .toBe('microsoft/entra-app-registration')
  })

  it('reads the full owner/repo/name path', () => {
    expect(skillKeyFromPath('/gh/microsoft/skills/entra-app-registration'))
      .toBe('microsoft/skills/entra-app-registration')
  })

  it('lowercases, because registry identity is matched case-insensitively', () => {
    expect(skillKeyFromPath('/gh/Microsoft/Entra-App-Registration'))
      .toBe('microsoft/entra-app-registration')
  })

  it('tolerates a trailing slash', () => {
    expect(skillKeyFromPath('/gh/microsoft/entra-app-registration/'))
      .toBe('microsoft/entra-app-registration')
  })

  it('ignores paths that are not skills', () => {
    expect(skillKeyFromPath('/gh/microsoft')).toBeNull()
    expect(skillKeyFromPath('/gh/')).toBeNull()
    expect(skillKeyFromPath('/skills/microsoft/entra-app-registration')).toBeNull()
    expect(skillKeyFromPath('/')).toBeNull()
    expect(skillKeyFromPath('/gh/a/b/c/d')).toBeNull()
    expect(skillKeyFromPath('/gh/a//b')).toBeNull()
  })
})

describe('goneSkillKeys', () => {
  it('covers both shapes the same skill answers on', () => {
    expect(goneSkillKeys([microsoft])).toEqual([
      'microsoft/entra-app-registration',
      'microsoft/skills/entra-app-registration',
    ])
  })

  it('drops the flat slug when a repository already owns that path', () => {
    // `/gh/acme/toolkit` is the repository page; 410 there would break a live page.
    const keys = goneSkillKeys([{
      owner: 'acme',
      repo: 'skills',
      name: 'toolkit',
      slug: 'acme/toolkit',
      name_collides_with_repo: 1,
    }])
    expect(keys).toEqual(['acme/skills/toolkit'])
    expect(keys).not.toContain('acme/toolkit')
  })

  it('survives a missing slug', () => {
    expect(goneSkillKeys([{ ...microsoft, slug: null }]))
      .toEqual(['microsoft/skills/entra-app-registration'])
  })

  it('deduplicates skills sharing a path shape', () => {
    expect(goneSkillKeys([microsoft, microsoft])).toEqual([
      'microsoft/entra-app-registration',
      'microsoft/skills/entra-app-registration',
    ])
  })

  it('is empty when nothing is gone', () => {
    expect(goneSkillKeys([])).toEqual([])
  })
})
