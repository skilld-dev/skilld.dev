import { describe, expect, it } from 'vitest'
import { authorBadgeInput } from '../../app/utils/author-badge'

describe('author badge target', () => {
  it('links a repository badge to the repository page', () => {
    const input = authorBadgeInput({
      _tag: 'repository',
      owner: 'jd-solanki',
      repo: 'skills',
      name: 'setup-jd-solanki-skills',
    })

    expect(input.registryPath).toBe('/gh/jd-solanki/skills')
  })

  it('links an individual badge to its skill page in a multi-skill repository', () => {
    const input = authorBadgeInput({
      _tag: 'skill',
      owner: 'jd-solanki',
      repo: 'skills',
      name: 'setup-jd-solanki-skills',
      repositorySkillCount: 12,
    })

    expect(input.registryPath).toBe('/gh/jd-solanki/skills/setup-jd-solanki-skills')
  })
})
