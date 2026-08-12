import { describe, expect, it } from 'vitest'
import { RENAMED_CLUSTER_SLUGS } from '../../layers/registry/server/data/clusters'
import { resolveSkillsRoute } from '../../layers/registry/server/utils/skills-route-policy'

describe('skills route policy', () => {
  it('passes known marketing routes through', () => {
    expect(resolveSkillsRoute('/skills/planning', '')).toEqual({ _tag: 'pass' })
    expect(resolveSkillsRoute('/skills/tag/nuxt', '')).toEqual({ _tag: 'pass' })
    expect(resolveSkillsRoute('/skills/leaderboard', '')).toEqual({ _tag: 'pass' })
  })

  it('passes renamed category slugs through to the redirect layer', () => {
    // `plan` stopped being a cluster in the 2026-08-12 rework. It must not 404
    // here, or the 301 in nuxt.config never gets a chance to run.
    for (const legacy of Object.keys(RENAMED_CLUSTER_SLUGS))
      expect(resolveSkillsRoute(`/skills/${legacy}`, ''), legacy).toEqual({ _tag: 'pass' })
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
