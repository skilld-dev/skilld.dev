import { describe, expect, it } from 'vitest'
import { resolveMissingRepoRedirect } from '../../layers/registry/app/utils/missing-repo-recovery'
import { resolveOrgsRedirect } from '../../layers/registry/server/utils/orgs-route-policy'

const mattpocock = [
  { repo: 'skills', name: 'grill-me', registryPath: '/gh/mattpocock/skills/grill-me' },
  { repo: 'skills', name: 'batch-grill-me', registryPath: '/gh/mattpocock/skills/batch-grill-me' },
  { repo: 'skills', name: 'code-review', registryPath: '/gh/mattpocock/skills/code-review' },
]

describe('missing repo recovery', () => {
  it('recovers a link that dropped the repository segment', () => {
    // csdn.net links to /gh/mattpocock/grill-me. The skill is one level deeper.
    expect(resolveMissingRepoRedirect({
      owner: 'mattpocock',
      repo: 'grill-me',
      skills: mattpocock,
    })).toEqual({ _tag: 'redirect', location: '/gh/mattpocock/skills/grill-me' })
  })

  it('matches the skill name case-insensitively', () => {
    expect(resolveMissingRepoRedirect({
      owner: 'mattpocock',
      repo: 'Grill-Me',
      skills: mattpocock,
    })).toEqual({ _tag: 'redirect', location: '/gh/mattpocock/skills/grill-me' })
  })

  it('keeps the 404 when the name is ambiguous across repositories', () => {
    expect(resolveMissingRepoRedirect({
      owner: 'acme',
      repo: 'review',
      skills: [
        { repo: 'front', name: 'review', registryPath: '/gh/acme/front/review' },
        { repo: 'back', name: 'review', registryPath: '/gh/acme/back/review' },
      ],
    })).toEqual({ _tag: 'not_found' })
  })

  it('keeps the 404 when nothing matches', () => {
    expect(resolveMissingRepoRedirect({
      owner: 'mattpocock',
      repo: 'not-a-skill',
      skills: mattpocock,
    })).toEqual({ _tag: 'not_found' })
    expect(resolveMissingRepoRedirect({ owner: 'acme', repo: 'x', skills: [] })).toEqual({ _tag: 'not_found' })
  })
})

describe('orgs route policy', () => {
  it('sends the bare index to the owner surface, not into a dead /gh', () => {
    expect(resolveOrgsRedirect('/orgs', '')).toEqual({ _tag: 'redirect', location: '/community' })
    expect(resolveOrgsRedirect('/orgs/', '')).toEqual({ _tag: 'redirect', location: '/community' })
  })

  it('sends an owner to its live author profile, with the query', () => {
    expect(resolveOrgsRedirect('/orgs/atlassian', '?ref=x')).toEqual({
      _tag: 'redirect',
      location: '/@atlassian?ref=x',
    })
  })

  it('leaves unrelated paths alone', () => {
    expect(resolveOrgsRedirect('/gh/atlassian', '')).toEqual({ _tag: 'pass' })
    expect(resolveOrgsRedirect('/organisations', '')).toEqual({ _tag: 'pass' })
  })
})
