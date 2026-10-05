// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { comparisonLinkForSkill, comparisonLinkForTrack } from '../../shared/comparison-navigation'

describe('comparison navigation', () => {
  it('links the canonical prose editing track', () => {
    expect(comparisonLinkForTrack('anti-slop')?.to).toBe('/compare/humanize-writing-skills')
    expect(comparisonLinkForTrack('code-quality')).toBeUndefined()
  })
  it.each([
    { owner: 'blader', repo: 'humanizer', name: 'humanizer' },
    { owner: 'hardikpandya', repo: 'stop-slop', name: 'stop-slop' },
    { owner: 'PeterGYang', repo: 'No-AI-Slop', name: 'No-AI-Slop' },
  ])('links a featured Skill to its comparison: $owner/$repo/$name', (skill) => {
    expect(comparisonLinkForSkill(skill)?.to).toBe('/compare/humanize-writing-skills')
  })

  it.each([
    { owner: 'another-owner', repo: 'humanizer', name: 'humanizer' },
    { owner: 'blader', repo: 'another-repository', name: 'humanizer' },
    { owner: 'blader', repo: 'humanizer', name: 'another-skill' },
    { owner: 'brianlovin', repo: 'deslop', name: 'deslop' },
  ])('leaves an unrelated Skill without a comparison: $owner/$repo/$name', (skill) => {
    expect(comparisonLinkForSkill(skill)).toBeUndefined()
  })
})
