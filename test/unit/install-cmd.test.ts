import { describe, expect, it } from 'vitest'
import {
  collectionInstallCmd,
  curatorInstallCmd,
  gitInstallCmd,
  tokenizeInstallCmd,
} from '../../app/utils/install-cmd'

describe('install commands', () => {
  it.each([
    [gitInstallCmd('nuxt', 'nuxt'), 'npx skilld add nuxt/nuxt'],
    [curatorInstallCmd('harlan-zw'), 'npx skilld add @harlan-zw'],
    [collectionInstallCmd('harlan-zw', 'nuxt'), 'npx skilld add @harlan-zw/nuxt'],
  ])('returns %s', (command, expected) => {
    expect(command).toBe(expected)
  })
})

describe('tokenizeInstallCmd', () => {
  it.each([
    ['npx skilld search vue', 'search'],
    ['npx skilld outdated', 'outdated'],
  ])('dims the subcommand in %s, so the query or Skill name carries the weight', (command, sub) => {
    const tokens = tokenizeInstallCmd(command)
    expect(tokens.find(token => token.text === sub)?.role).toBe('sub')
  })
})
