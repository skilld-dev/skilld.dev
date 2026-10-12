import { describe, expect, it } from 'vitest'
import { loadPublicDigestChanges, publicDigestCommitsSchema, publicDigestUpdatesSchema } from '../../layers/identity/server/utils/public-digest'

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
  const commits = { commits: [
    { sha: 'def', message: 'Fix keyboard focus\nExplain author reasoning', date: new Date(100_000).toISOString(), url: 'https://github.com/example/skills/commit/def' },
    { sha: 'old', message: 'Old change', date: new Date(80_000).toISOString(), url: 'https://github.com/example/skills/commit/old' },
    { sha: 'future', message: 'Future change', date: new Date(120_000).toISOString(), url: 'https://github.com/example/skills/commit/future' },
  ] }

  it('finds grouped repository changes without attributing old sibling Skills to this week', async () => {
    const calls: string[] = []
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadCommits: async () => commits,
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
      commitMessages: ['Fix keyboard focus'],
      sourceUrl: skill.sourceUrl,
      changeUrl: 'https://github.com/example/skills/commit/def',
    }])
  })

  it('shows real source changes without account or trending data', async () => {
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadCommits: async () => commits,
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
      commitMessages: ['Fix keyboard focus'],
      sourceUrl: skill.sourceUrl,
      changeUrl: 'https://github.com/example/skills/commit/def',
    }])
  })

  it('uses file history when no revision commit is available', async () => {
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadCommits: async () => ({ commits: [] }),
      loadUpdates: async () => ({ items: [update] }),
      loadSkill: async () => ({ ...skill, sourceCommit: null }),
    })
    expect(result[0]?.changeUrl).toBe('https://github.com/example/skills/commits/main/review/SKILL.md')
    expect(result[0]?.commitMessages).toEqual([])
  })

  it('keeps the fallback truthful when file history has no dated author messages', async () => {
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadUpdates: async () => ({ items: [update] }),
      loadSkill: async () => skill,
      loadCommits: async () => publicDigestCommitsSchema.parse({ commits: [
        { sha: 'unknown', message: 'No source date', date: '', url: 'https://github.com/example/skills/commit/unknown' },
        ...commits.commits.filter(commit => commit.sha !== 'def'),
      ] }),
    })
    expect(result[0]?.commitMessages).toEqual([])
    expect(result[0]?.changedAt).toBe(100)
    expect(result[0]?.changeUrl).toBe('https://github.com/example/skills/commit/def')
  })

  it('omits grouped entries without a source change date', async () => {
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadCommits: async () => ({ commits: [] }),
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
    const commitCalls: string[] = []
    const names = ['review', 'review', ...Array.from({ length: 35 }, (_, index) => `skill-${index}`)]
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadCommits: async (item) => {
        commitCalls.push(item.name)
        return commits
      },
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
    expect(commitCalls).toEqual(['review', 'skill-0', 'skill-1', 'skill-2', 'skill-3'])
  })

  it('omits removed sources and changes outside the example window', async () => {
    const calls: string[] = []
    const result = await loadPublicDigestChanges({
      windowStart: 90,
      windowEnd: 110,
      loadCommits: async () => ({ commits: [] }),
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
