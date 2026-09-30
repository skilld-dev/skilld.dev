import { describe, expect, it } from 'vitest'
import { hubRendersSource } from '#shared/repo-identity'

describe('hubRendersSource', () => {
  const registry = { owner: 'hyf0', repo: 'vue-skills' }

  it('refuses a hub whose GitHub identity moved', () => {
    expect(hubRendersSource(registry, { owner: 'vuejs-ai', repo: 'skills' })).toBe(false)
  })

  it('accepts the same identity in any case', () => {
    expect(hubRendersSource(registry, { owner: 'HYF0', repo: 'Vue-Skills' })).toBe(true)
  })

  it('accepts a hub with no stored source identity', () => {
    expect(hubRendersSource(registry, { owner: null, repo: null })).toBe(true)
    expect(hubRendersSource(registry, null)).toBe(true)
  })
})
