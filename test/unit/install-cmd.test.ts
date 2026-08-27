import { describe, expect, it } from 'vitest'
import {
  collectionInstallCmd,
  curatorInstallCmd,
  gitInstallCmd,
  skillInstallCmd,
  skillRunCmd,
  skillRunPrompt,
} from '../../app/utils/install-cmd'

describe('skill commands', () => {
  it.each([
    [skillRunCmd('nuxt', 'nuxt', 'seo'), 'npx skilld@beta run skilld:nuxt/nuxt/seo'],
    [skillInstallCmd('nuxt', 'nuxt', 'seo'), 'npx skilld@beta install skilld:nuxt/nuxt/seo'],
  ])('returns %s', (command, expected) => {
    expect(command).toBe(expected)
  })

  it('turns a transient Skill command into an Agent prompt', () => {
    expect(skillRunPrompt('npx skilld@beta run skilld:nuxt/nuxt/seo'))
      .toBe('Run `npx skilld@beta run skilld:nuxt/nuxt/seo` and follow the loaded Skill instructions.')
  })
})

describe('install commands', () => {
  it.each([
    [gitInstallCmd('nuxt', 'nuxt', 'seo'), 'npx skilld add gh:nuxt/nuxt -s seo'],
    [gitInstallCmd('nuxt', 'nuxt'), 'npx skilld add gh:nuxt/nuxt'],
    [curatorInstallCmd('harlan-zw'), 'npx skilld add @harlan-zw'],
    [collectionInstallCmd('harlan-zw', 'nuxt'), 'npx skilld add @harlan-zw/nuxt'],
  ])('returns %s', (command, expected) => {
    expect(command).toBe(expected)
  })
})
