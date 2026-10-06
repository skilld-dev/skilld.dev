import type { SkillCardSkill } from '../../app/types/skill-card'
import type { SkillCardOptions } from '../../app/utils/skill-card-view'
import { describe, expect, it } from 'vitest'
import { buildSkillCardView } from '../../app/utils/skill-card-view'

const skill: SkillCardSkill = {
  owner: 'antfu',
  repo: 'skills',
  name: 'nuxt',
  registryPath: '/gh/antfu/skills/nuxt',
  description: '  Build full-stack Vue applications with Nuxt.  ',
  stars: 12_345,
  likeCount: 1,
  modifiedAt: 1_700_000_000,
  authorName: 'Anthony Fu',
  skillFileUrl: 'https://github.com/antfu/skills/blob/main/skills/nuxt/SKILL.md',
}

const card: SkillCardOptions = { layout: 'card', byline: 'full', metric: 'stars', trending: false }
const run = { copied: false, copy: () => {} }

function view(overrides: Partial<SkillCardSkill> = {}, options: Partial<SkillCardOptions> = {}) {
  return buildSkillCardView({ ...skill, ...overrides }, { ...card, ...options }, run)
}

describe('skill card view', () => {
  it('names the Skill as a slash command and credits the author by name', () => {
    const result = view()

    expect(result.title).toBe('/nuxt')
    expect(result.label).toBe('/nuxt by Anthony Fu')
    expect(result.source).toBe('antfu/skills')
    expect(result.description).toBe('Build full-stack Vue applications with Nuxt.')
  })

  it('credits the handle when GitHub has no distinct name for the owner', () => {
    const result = view({ authorName: 'antfu' })

    expect(result.author).toBeNull()
    expect(result.label).toBe('/nuxt by antfu')
  })

  it('hides zero stars, which can mean the stars were never fetched', () => {
    expect(view({ stars: 0 }).metric).toBeNull()
    expect(view({ stars: null }).metric).toBeNull()
    expect(view().metric).toMatchObject({ _tag: 'stars', text: '12k', title: '12,345 GitHub stars' })
  })

  it('counts stars in the singular for one star', () => {
    expect(view({ stars: 1 }).metric).toMatchObject({ text: '1', title: '1 GitHub star' })
  })

  it('counts likes in the singular for one like', () => {
    expect(view({}, { metric: 'likes' }).metric).toMatchObject({ _tag: 'likes', text: '1', title: '1 like' })
    expect(view({ likeCount: 0 }, { metric: 'likes' }).metric).toMatchObject({ text: '0', title: '0 likes' })
  })

  it('dates an update from the push when the Skill has no change time', () => {
    const result = view({ modifiedAt: null, pushedAt: 1_600_000_000 }, { metric: 'updated' })

    expect(result.metric).toMatchObject({ _tag: 'updated', iso: new Date(1_600_000_000 * 1000).toISOString() })
    expect(view({ modifiedAt: 0, pushedAt: null }, { metric: 'updated' }).metric).toBeNull()
  })

  it('offers only the run command on a card, and nothing on a compact entry', () => {
    const card = view()
    const compact = view({}, { layout: 'compact' })

    expect(card.run?.command).toBe('npx skilld run antfu/skills/nuxt')
    expect([card.like, card.sourceUrl]).toEqual([null, null])
    expect([compact.run, compact.like, compact.sourceUrl]).toEqual([null, null, null])
  })

  it('shows likes and SKILL.md only where the context asks', () => {
    const result = view({}, { actions: ['like', 'source'] })

    expect(result.like).toEqual({ count: 1 })
    expect(result.sourceUrl).toBe(skill.skillFileUrl)
  })

  it('drops the description from a compact entry unless the context asks for it', () => {
    expect(view({}, { layout: 'compact' }).description).toBeNull()
    expect(view({}, { layout: 'compact', description: true }).description).toBe('Build full-stack Vue applications with Nuxt.')
  })

  it('drops the source link when the Skill has no known SKILL.md', () => {
    expect(view({ skillFileUrl: null }, { actions: ['source'] }).sourceUrl).toBeNull()
  })

  it('keeps only the controls the context asks for', () => {
    const result = view({}, { actions: ['source'] })

    expect(result.run).toBeNull()
    expect(result.like).toBeNull()
    expect(result.sourceUrl).toBe(skill.skillFileUrl)
  })

  it('omits the description and a blank note when the context hides them', () => {
    const result = view({}, { description: false, note: '   ' })

    expect(result.description).toBeNull()
    expect(result.note).toBeNull()
  })

  it('names the analytics surface after the layout unless the context names one', () => {
    expect(view({}, { layout: 'row' }).surface).toBe('skill-row')
    expect(view({}, { surface: 'collection' }).surface).toBe('collection')
  })
})
