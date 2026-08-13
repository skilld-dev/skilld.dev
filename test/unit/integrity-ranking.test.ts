import { describe, expect, it } from 'vitest'
import { SkillsListQuery } from '../../layers/registry/server/schemas/skills-query'
import {
  resolveSkillTrust,
  TRUST_STARS_CANDIDATE,
} from '../../layers/registry/server/utils/skill-trust'

function trustInput(overrides: Partial<Parameters<typeof resolveSkillTrust>[0]> & { installs?: number } = {}) {
  return {
    owner: 'maintainer',
    repo: 'agent-skills',
    sourceResolved: true,
    stars: 0,
    curatorReasonCount: 0,
    approvedSocialCount: 0,
    repoSkillCount: 1,
    ...overrides,
  }
}

describe('integrity ranking policy', () => {
  it('defaults skill browsing to GitHub stars', () => {
    expect(SkillsListQuery.parse({}).sort).toBe('stars')
  })

  it('uses GitHub stars as candidate evidence and ignores installs', () => {
    expect(resolveSkillTrust(trustInput({ stars: TRUST_STARS_CANDIDATE }))).toMatchObject({
      tier: 'candidate',
      source: 'github-stars',
      reasons: ['high_github_stars'],
    })

    expect(resolveSkillTrust(trustInput({ installs: 1_000_000 }))).toMatchObject({
      tier: 'untrusted',
      source: 'computed',
      reasons: ['no_trust_signal'],
    })
  })

  it('keeps human review above star evidence', () => {
    expect(resolveSkillTrust(trustInput({
      stars: TRUST_STARS_CANDIDATE,
      curatorReasonCount: 1,
    }))).toMatchObject({
      tier: 'trusted-curator',
      source: 'curator-reason',
    })
  })
})
