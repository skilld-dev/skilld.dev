import { describe, expect, it } from 'vitest'
import {
  skillInstallCmd,
  skillPageUrl,
  skillRawUrl,
  skillRunCmd,
  skillRunPrompt,
} from '../../shared/skill-commands'

describe('skill commands', () => {
  it.each([
    [skillRunCmd('nuxt', 'nuxt', 'seo'), 'npx skilld@beta run skilld:nuxt/nuxt/seo'],
    [skillInstallCmd('nuxt', 'nuxt', 'seo'), 'npx skilld@beta install skilld:nuxt/nuxt/seo'],
  ])('returns %s', (command, expected) => {
    expect(command).toBe(expected)
  })

  it('turns the Skill page into the prompt a developer gives an Agent', () => {
    expect(skillRunPrompt(skillPageUrl('nuxt', 'nuxt', 'seo')))
      .toBe('Use this Skill: https://skilld.dev/gh/nuxt/nuxt/seo')
  })
})

describe('skillRawUrl', () => {
  it('points at the pristine SKILL.md endpoint, which serves text/markdown', () => {
    expect(skillRawUrl('obra', 'superpowers', 'brainstorming'))
      .toBe('https://skilld.dev/api/skills-raw/obra/superpowers/brainstorming')
  })

  it('addresses a file beside SKILL.md on the same endpoint', () => {
    expect(skillRawUrl('obra', 'superpowers', 'brainstorming', 'references/api.md'))
      .toBe('https://skilld.dev/api/skills-raw/obra/superpowers/brainstorming/references/api.md')
  })
})
