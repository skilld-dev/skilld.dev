import { describe, expect, it } from 'vitest'
import {
  collectionInstallCmd,
  curatorInstallCmd,
  gitInstallCmd,
} from '../../app/utils/install-cmd'

describe('install commands', () => {
  it.each([
    [gitInstallCmd('nuxt', 'nuxt'), 'npx skilld add gh:nuxt/nuxt'],
    [curatorInstallCmd('harlan-zw'), 'npx skilld add @harlan-zw'],
    [collectionInstallCmd('harlan-zw', 'nuxt'), 'npx skilld add @harlan-zw/nuxt'],
  ])('returns %s', (command, expected) => {
    expect(command).toBe(expected)
  })

  it('names the CLI channel that parses a curator or collection ref', () => {
    // `latest` is the v2 CLI. It reads `@login/slug` as an npm package and
    // answers with a fuzzy npm suggestion, so every ref form has to reach v3.
    for (const command of [
      gitInstallCmd('nuxt', 'nuxt'),
      curatorInstallCmd('harlan-zw'),
      collectionInstallCmd('harlan-zw', 'nuxt'),
    ])
      expect(command.startsWith('npx skilld add ')).toBe(true)
  })
})
