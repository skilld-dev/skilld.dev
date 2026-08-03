import type { OrgProfile } from '../../layers/registry/server/api/orgs/[owner].get'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { selectRepoInfo, selectRepoSkills } from '../../layers/registry/app/utils/repo-profile'

const pageSource = readFileSync('layers/registry/app/pages/gh/[owner]/[repo]/index.vue', 'utf8')

// `useFetch<OrgProfile>` asserts the response type rather than validating it, so
// a partial body (error envelope, truncated payload, stale cached shape) reaches
// these selectors as a truthy object with no `skills` or `repos` (Sentry SKILLD-E).
const partialProfile = { owner: 'acme', description: null } as unknown as OrgProfile

describe('repo profile selectors', () => {
  it('returns no skills when the profile omits the skills array', () => {
    expect(selectRepoSkills(partialProfile, 'widgets')).toEqual([])
  })

  it('returns no repo info when the profile omits the repos array', () => {
    expect(selectRepoInfo(partialProfile, 'widgets')).toBeNull()
  })

  it('treats a null profile as empty', () => {
    expect(selectRepoSkills(null, 'widgets')).toEqual([])
    expect(selectRepoInfo(null, 'widgets')).toBeNull()
  })

  it('matches the requested repo case-insensitively and orders by recency then installs', () => {
    const profile = {
      skills: [
        { repo: 'Widgets', name: 'a', modifiedAt: 100, installs: 1 },
        { repo: 'widgets', name: 'b', modifiedAt: 300, installs: 2 },
        { repo: 'other', name: 'c', modifiedAt: 900, installs: 9 },
        { repo: 'widgets', name: 'd', modifiedAt: 300, installs: 7 },
      ],
      repos: [{ repo: 'widgets', stars: 5 }],
    } as unknown as OrgProfile

    expect(selectRepoSkills(profile, 'widgets').map(skill => skill.name)).toEqual(['d', 'b', 'a'])
    expect(selectRepoInfo(profile, 'widgets')?.stars).toBe(5)
  })

  it('keeps the page free of unguarded profile array access', () => {
    expect(pageSource).not.toMatch(/profile\.skills\.filter/)
    expect(pageSource).not.toMatch(/repoProfile\.value\.repos\.find/)
    expect(pageSource).toContain('selectRepoSkills')
    expect(pageSource).toContain('selectRepoInfo')
  })
})
