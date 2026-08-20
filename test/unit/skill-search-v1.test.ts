import { describe, expect, it } from 'vitest'
import { presentSkillSearch } from '../../layers/registry/server/presenters/skill-search-v1'
import { SkillSearchQuery, SkillSearchResponse } from '../../layers/registry/server/schemas/skill-search-v1'

describe('v1 Skill search contract', () => {
  it('presents a stable Repository selector for the CLI', () => {
    const result = presentSkillSearch({
      items: [{
        name: 'vue-testing',
        owner: 'skilld-dev',
        repo: 'skills',
        description: 'Test Vue components with current tools.',
        stars: 120,
      }],
      total: 1,
    })

    expect(SkillSearchResponse.parse(result)).toEqual({
      items: [{
        name: 'vue-testing',
        description: 'Test Vue components with current tools.',
        source: {
          provider: 'github',
          owner: 'skilld-dev',
          repository: 'skills',
          selector: { type: 'named-skill', name: 'vue-testing' },
        },
        stargazerCount: 120,
      }],
      total: 1,
    })
  })

  it('bounds the public query', () => {
    expect(SkillSearchQuery.parse({ q: ' vue ', limit: '50' })).toEqual({ q: 'vue', limit: 50 })
    expect(SkillSearchQuery.safeParse({ q: '', limit: '20' }).success).toBe(false)
    expect(SkillSearchQuery.safeParse({ q: 'vue', limit: '51' }).success).toBe(false)
  })
})
