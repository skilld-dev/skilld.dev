import { describe, expect, it } from 'vitest'
import { parseGitHubRepositoryUrl } from '../../shared/github-repository'

describe('parseGitHubRepositoryUrl', () => {
  it('parses a GitHub repository URL into its canonical identity', () => {
    expect(parseGitHubRepositoryUrl('https://github.com/JonathanXDR/nuxt-style-readme-skill')).toEqual({
      _tag: 'repository',
      owner: 'jonathanxdr',
      repo: 'nuxt-style-readme-skill',
      url: 'https://github.com/jonathanxdr/nuxt-style-readme-skill',
    })
  })

  it('accepts a copied path inside a GitHub repository', () => {
    expect(parseGitHubRepositoryUrl('https://github.com/nuxt/ui/tree/main/skills')).toMatchObject({
      _tag: 'repository',
      owner: 'nuxt',
      repo: 'ui',
    })
  })

  it.each([
    'nuxt ui',
    'https://gitlab.com/nuxt/ui',
    'https://github.com/nuxt',
    'https://github.com/nuxt/ui/issues',
  ])('does not treat %s as a repository URL', (input) => {
    expect(parseGitHubRepositoryUrl(input)).toEqual({ _tag: 'not_repository' })
  })
})
