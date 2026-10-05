import { describe, expect, it } from 'vitest'
import { loadPublicDigestChanges } from '../../layers/identity/server/utils/public-digest'

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
  const skill = { description: 'Review interfaces', sourceUrl: 'https://github.com/example/skills/blob/main/review/SKILL.md', sourceGone: false }

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
      changeUrl: 'https://github.com/example/skills/commit/abc',
    }])
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
        { kind: 'repo' as const },
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
