import { describe, expect, it } from 'vitest'
import { buildUnavailableRepoSourceProfile } from '../../layers/registry/server/utils/repo-source-profile'

describe('repository source fallback', () => {
  it('keeps a repository page usable when GitHub is temporarily unavailable', () => {
    expect(buildUnavailableRepoSourceProfile('tag', 'fixture')).toEqual({
      owner: 'tag',
      repo: 'fixture',
      description: null,
      githubUrl: 'https://github.com/tag/fixture',
      defaultBranch: 'main',
      stars: 0,
      forks: 0,
      pushedAt: '',
      createdAt: '',
      archived: false,
      fork: false,
      skillFileScanStatus: 'unavailable',
      skillFileCount: 0,
      skillFiles: [],
    })
  })
})
