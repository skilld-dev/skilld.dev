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

  it('truncates descriptions to 500 bytes without splitting a character', () => {
    const multiByte = '微'.repeat(200)
    const result = presentSkillSearch({
      items: [{
        name: 'summarize-wechat',
        owner: 'baoyu',
        repo: 'skills',
        description: multiByte,
        stars: 0,
      }],
      total: 1,
    })

    const description = result.items[0]!.description!
    expect(Buffer.byteLength(description)).toBeLessThanOrEqual(500)
    expect(Buffer.isBuffer(Buffer.from(description))).toBe(true)
    expect(description.endsWith('微')).toBe(true)
  })

  it('keeps ASCII descriptions under 500 bytes untouched', () => {
    const ascii = 'a'.repeat(500)
    const result = presentSkillSearch({
      items: [{ name: 'plain', owner: 'o', repo: 'r', description: ascii, stars: 1 }],
      total: 1,
    })
    expect(result.items[0]!.description).toBe(ascii)
  })
})
