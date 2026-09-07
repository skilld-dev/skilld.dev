import { describe, expect, it } from 'vitest'
import {
  collectionInstallCmd,
  curatorInstallCmd,
  gitInstallCmd,
} from '../../app/utils/install-cmd'

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
