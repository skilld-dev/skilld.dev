import { describe, expect, it } from 'vitest'
import { loadPublicDigestChanges, publicDigestUpdatesSchema } from '../../layers/identity/server/utils/public-digest'

describe('public digest example', () => {
  const update = {
    kind: 'skill' as const,
    owner: 'example',
    repo: 'skills',
    name: 'review',
    occurredAt: 100,
    sha: 'abc',
    changeSummary: 'Add keyboard checks',
  }
  const skill = { description: 'Review interfaces', sourceUrl: 'https://github.com/example/skills/blob/main/review/SKILL.md', sourceGone: false, sourceCommit: 'def', updatedAt: new Date(100_000).toISOString() }

  it('finds grouped repository changes without attributing old sibling Skills to this week', async () => {
    const calls: string[] = []
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadUpdates: async () => publicDigestUpdatesSchema.parse({ items: [{
        kind: 'repo',
        owner: 'example',
        repo: 'skills',
        occurredAt: 105,
        changeSummary: 'Only the head Skill changed',
        skills: [{ name: 'review' }, { name: 'old-sibling' }, { name: 'removed' }],
      }] }),
      loadSkill: async (item) => {
        calls.push(item.name)
        return { ...skill, updatedAt: new Date((item.name === 'old-sibling' ? 80 : 100) * 1000).toISOString(), sourceGone: item.name === 'removed' }
      },
    })
    expect(calls).toEqual(['review', 'old-sibling', 'removed'])
    expect(result).toEqual([{
      owner: 'example',
      repo: 'skills',
      name: 'review',
      slug: 'review',
      description: skill.description,
      changeCount: 1,
      changedAt: 100,
      commitMessages: [],
      sourceUrl: skill.sourceUrl,
      changeUrl: 'https://github.com/example/skills/commit/def',
    }])
  })

  it('shows real source changes without account or trending data', async () => {
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadUpdates: async () => ({ items: [update] }),
      loadSkill: async () => skill,
    })
    expect(result).toEqual([{
      owner: 'example',
      repo: 'skills',
      name: 'review',
      slug: 'review',
      description: 'Review interfaces',
      changeCount: 1,
      changedAt: 100,
      commitMessages: ['Add keyboard checks'],
      sourceUrl: skill.sourceUrl,
      changeUrl: 'https://github.com/example/skills/commit/def',
    }])
  })

  it('uses file history when no revision commit is available', async () => {
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadUpdates: async () => ({ items: [update] }),
      loadSkill: async () => ({ ...skill, sourceCommit: null }),
    })
    expect(result[0]?.changeUrl).toBe('https://github.com/example/skills/commits/main/review/SKILL.md')
  })

  it('omits grouped entries without a source change date', async () => {
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadUpdates: async () => publicDigestUpdatesSchema.parse({ items: [{
        kind: 'repo',
        owner: 'example',
        repo: 'skills',
        occurredAt: 100,
        skills: [{ name: 'unknown' }],
      }] }),
      loadSkill: async () => ({ ...skill, updatedAt: null }),
    })
    expect(result).toEqual([])
  })

  it('bounds detail reads and reads duplicate Skills only once', async () => {
    const calls: string[] = []
    const names = ['review', 'review', ...Array.from({ length: 35 }, (_, index) => `skill-${index}`)]
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadUpdates: async () => publicDigestUpdatesSchema.parse({ items: [{
        kind: 'repo',
        owner: 'example',
        repo: 'skills',
        occurredAt: 100,
        skills: names.map(name => ({ name })),
      }] }),
      loadSkill: async (item) => {
        calls.push(item.name)
        return skill
      },
    })
    expect(calls).toEqual(['review', ...Array.from({ length: 29 }, (_, index) => `skill-${index}`)])
    expect(result.map(item => item.name)).toEqual(['review', 'skill-0', 'skill-1', 'skill-2', 'skill-3'])
  })

  it('omits removed sources and changes outside the example window', async () => {
    const calls: string[] = []
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadUpdates: async () => ({ items: [
        { ...update, occurredAt: 80 },
        { ...update, occurredAt: 120 },
        update,
        { kind: 'repo' as const, owner: 'example', repo: 'other', occurredAt: 80, skills: [{ name: 'older' }] },
      ] }),
      loadSkill: async (item) => {
        calls.push(item.name)
        return { ...skill, sourceGone: true }
      },
    })
    expect(result).toEqual([])
    expect(calls).toEqual(['review'])
  })
})
