import { describe, expect, it } from 'vitest'
import { searchResultsRoute } from '../../app/composables/useSkillSearch'
import { classifySearchQuery, normalizeSearchQuery } from '../../shared/skill-search-query'

const repository = (owner: string, repo: string) => ({ _tag: 'repository', owner, repo, url: `https://github.com/${owner}/${repo}` })

describe('normalizeSearchQuery', () => {
  it.each([
    ['  Review   my PRs?  ', 'review my prs'],
    ['Next.js', 'next.js'],
    ['ｖｉｔｅｓｔ', 'vitest'],
    ['...', ''],
    ['', ''],
  ])('normalises %j to %j', (input, expected) => {
    expect(normalizeSearchQuery(input)).toBe(expected)
  })

  it('cuts a long query to the box limit', () => {
    expect(normalizeSearchQuery('a '.repeat(300))).toHaveLength(199)
  })
})

describe('classifySearchQuery', () => {
  it.each([
    ['https://github.com/vercel-labs/agent-skills', { _tag: 'repository', repository: repository('vercel-labs', 'agent-skills'), source: 'url' }],
    ['github.com/Anthropics/skills', { _tag: 'repository', repository: repository('anthropics', 'skills'), source: 'url' }],
    ['https://github.com/nuxt/ui/tree/main/skills', { _tag: 'repository', repository: repository('nuxt', 'ui'), source: 'url' }],
    ['vercel-labs/agent-skills', { _tag: 'repository', repository: repository('vercel-labs', 'agent-skills'), source: 'ref' }],
    ['github.com/antfu', { _tag: 'owner', login: 'antfu' }],
    ['@MattPocock', { _tag: 'owner', login: 'mattpocock' }],
    ['anthropics/skills/frontend-design', { _tag: 'skill', owner: 'anthropics', repo: 'skills', name: 'frontend-design' }],
    ['vitest', { _tag: 'name', text: 'vitest' }],
    ['tailwnd', { _tag: 'name', text: 'tailwnd' }],
    ['make my UI less generic', { _tag: 'intent', text: 'make my ui less generic' }],
    ['reacct hooks', { _tag: 'intent', text: 'reacct hooks' }],
    ['   ', { _tag: 'empty' }],
  ])('classifies %j', (input, expected) => {
    expect(classifySearchQuery(input)).toEqual(expected)
  })

  it.each([
    'https://gitlab.com/nuxt/ui',
    'https://github.com/nuxt/ui/issues',
    'ci/cd pipelines',
    '@',
  ])('does not treat %j as a Repository or an owner', (input) => {
    expect(['name', 'intent']).toContain(classifySearchQuery(input)._tag)
  })
})

describe('searchResultsRoute', () => {
  it.each([
    ['', { path: '/skills' }],
    ['vitest', { path: '/skills', query: { q: 'vitest' } }],
    ['@antfu', { path: '/skills', query: { owner: 'antfu' } }],
    ['test a vue app', { path: '/skills', query: { q: 'test a vue app', ai: '1' } }],
  ])('sends %j to the matching results page', (term, expected) => {
    expect(searchResultsRoute(term)).toEqual(expected)
  })
})
