import { describe, expect, it } from 'vitest'
import { resolveSkillsRoute } from '../../layers/registry/server/utils/skills-route-policy'

describe('skills route policy', () => {
  it('passes known marketing routes through', () => {
    expect(resolveSkillsRoute('/skills/plan', '')).toEqual({ _tag: 'pass' })
    expect(resolveSkillsRoute('/skills/tag/nuxt', '')).toEqual({ _tag: 'pass' })
  })

  it('returns a 404 decision for unknown one-segment outcomes', () => {
    expect(resolveSkillsRoute('/skills/not-a-real-outcome', '')).toEqual({
      _tag: 'not_found',
    })
  })

  it('preserves redirects for legacy multi-segment skill routes', () => {
    expect(resolveSkillsRoute('/skills/acme/repo/skill', '?tab=files')).toEqual({
      _tag: 'redirect',
      location: '/gh/acme/repo/skill?tab=files',
    })
  })
})
