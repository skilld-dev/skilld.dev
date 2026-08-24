// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { trendingSkillKey, trendingSkillKeySet } from '#shared/trending-keys'

describe('trending skill keys', () => {
  it('matches the catalog against the feed despite disagreeing case', () => {
    // The feed lowercases owners when it parses them out of a post URL. GitHub
    // and the catalog keep the owner's real capitalisation. Both must resolve
    // to the same key or `/skills` shows no flames at all.
    const set = trendingSkillKeySet([
      { owner: 'lukeberrypi', repo: 'skills', name: 'remove-dumb-comments' },
    ])

    expect(set.has(trendingSkillKey('LukeberryPi', 'skills', 'remove-dumb-comments'))).toBe(true)
  })

  it('keeps different skills in the same repository apart', () => {
    const set = trendingSkillKeySet([
      { owner: 'obra', repo: 'superpowers', name: 'brainstorming' },
    ])

    expect(set.has(trendingSkillKey('obra', 'superpowers', 'brainstorming'))).toBe(true)
    expect(set.has(trendingSkillKey('obra', 'superpowers', 'executing-plans'))).toBe(false)
  })

  it('keeps the same skill name in different repositories apart', () => {
    const set = trendingSkillKeySet([
      { owner: 'a', repo: 'one', name: 'review' },
    ])

    expect(set.has(trendingSkillKey('a', 'two', 'review'))).toBe(false)
    expect(set.has(trendingSkillKey('b', 'one', 'review'))).toBe(false)
  })

  it('collapses a repeated skill to one entry', () => {
    const set = trendingSkillKeySet([
      { owner: 'a', repo: 'r', name: 's' },
      { owner: 'A', repo: 'R', name: 'S' },
    ])

    expect(set.size).toBe(1)
  })

  it('is empty for an empty board rather than throwing', () => {
    expect(trendingSkillKeySet([]).size).toBe(0)
  })
})
