import type { OrgProfile } from '../../layers/registry/server/api/orgs/[owner].get'
import { describe, expect, it } from 'vitest'
import { ownerPageProfile, repoPageProfile, selectRepoSkills } from '../../layers/registry/app/utils/repo-profile'

const profile = {
  owner: 'acme',
  skills: [
    { owner: 'acme', repo: 'widgets', name: 'design', registryPath: '/gh/acme/widgets/design', slug: 'acme/widgets/design', displayName: 'Design', description: 'Design widgets', stars: 5, likeCount: 2, modifiedAt: 10, pushedAt: 8, firstSeenAt: 4, dependencies: ['testing'], renderedRawSha256: 'hash', trustScore: 100, seoIndexable: true },
    { owner: 'acme', repo: 'tools', name: 'testing', registryPath: '/gh/acme/tools/testing', slug: 'acme/tools/testing' },
  ],
  repos: [{ repo: 'widgets', count: 1 }, { repo: 'tools', count: 1 }],
} as unknown as OrgProfile

describe('page profile payloads', () => {
  it('preserves card content and canonical links without serializing admission evidence', () => {
    const result = ownerPageProfile(profile)
    expect(result.skills[0]).toEqual({ owner: 'acme', repo: 'widgets', name: 'design', registryPath: '/gh/acme/widgets/design', slug: 'acme/widgets/design', displayName: 'Design', description: 'Design widgets', stars: 5, likeCount: 2, modifiedAt: 10, pushedAt: 8, firstSeenAt: 4, dependencies: ['testing'], authorName: undefined, skillFileUrl: undefined })
    expect(profile.skills[0]?.trustScore).toBe(100)
  })

  it('keeps only the requested Repository, including case-insensitive selection', () => {
    const result = repoPageProfile(profile, 'WIDGETS')
    expect(result.skills.map(skill => skill.registryPath)).toEqual(['/gh/acme/widgets/design'])
    expect(result.repos).toEqual([{ repo: 'widgets', count: 1 }])
    expect(selectRepoSkills(result, 'widgets')[0]?.dependencies).toEqual(['testing'])
  })

  it('preserves recovery to an unambiguous Skill outside the requested Repository', () => {
    expect(repoPageProfile(profile, 'testing').missingRepoTarget).toEqual({ _tag: 'redirect', location: '/gh/acme/tools/testing' })
  })

  it('does not guess when two Repositories publish the missing name', () => {
    const ambiguous = { ...profile, skills: [...profile.skills, { ...profile.skills[1]!, repo: 'other', registryPath: '/gh/acme/other/testing' }] }
    expect(repoPageProfile(ambiguous, 'testing').missingRepoTarget).toEqual({ _tag: 'not_found' })
  })
})
