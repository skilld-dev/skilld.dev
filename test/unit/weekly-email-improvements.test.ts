import type { WeeklyRenderInput, WeeklyTrendingSkill } from '../../layers/identity/server/utils/weekly-template'
import { describe, expect, it } from 'vitest'
import { reasonLine, renderWeekly, trimQuote } from '../../layers/identity/server/utils/weekly-template'
import { parseWeeklyClick } from '../../layers/identity/server/utils/weekly-tracking'

const WINDOW_END = 1_787_500_000

function trending(index: number): WeeklyTrendingSkill {
  return {
    owner: `owner-${index}`,
    repo: `repo-${index}`,
    slug: `skill-${index}`,
    canonicalName: `skill-${index}`,
    description: 'A useful Skill.',
    stars: 1200,
    sourceUrl: `https://github.com/owner-${index}/repo-${index}/blob/sha/SKILL.md`,
    reason: { _tag: 'named', authorCount: 2, mentionCount: 3, latestAt: WINDOW_END },
    evidence: null,
  }
}

function input(): WeeklyRenderInput {
  return {
    recipientName: 'Harlan',
    userId: 1,
    windowStart: WINDOW_END - 7 * 86_400,
    windowEnd: WINDOW_END,
    likedChanges: [{
      owner: 'antfu',
      repo: 'skills',
      name: 'vitest',
      slug: 'vitest',
      description: 'Testing conventions.',
      changeCount: 2,
      changedAt: WINDOW_END - 600,
      commitMessages: ['Improve browser mode'],
      sourceUrl: 'https://github.com/antfu/skills/blob/new-sha/skills/vitest/SKILL.md',
      changeUrl: 'https://github.com/antfu/skills/compare/old-sha...new-sha',
    }],
    likedOverflow: 0,
    trackedCount: 1,
    trending: Array.from({ length: 8 }, (_, index) => trending(index + 1)),
    siteUrl: 'https://skilld.dev',
    unsubscribeUrl: 'https://skilld.dev/api/unsubscribe?t=token&list=digest',
    settingsUrl: 'https://skilld.dev/me',
  }
}

describe('weekly email improvement contract', () => {
  it('uses honest social attribution', () => {
    expect(reasonLine({ _tag: 'named', authorCount: 2, mentionCount: 4, latestAt: WINDOW_END }, WINDOW_END))
      .toContain('2 accounts mentioned it')
  })

  it('removes install commands and cuts on a word boundary', () => {
    const quote = trimQuote(`Useful release. npx skills add competitor/pkg ${'long words '.repeat(30)}`)

    expect(quote).not.toContain('npx skills add')
    expect(quote).toMatch(/\w…$/)
  })

  it('links exact source and change destinations', () => {
    const rendered = renderWeekly(input())

    expect(rendered.html).toContain('https://github.com/antfu/skills/blob/new-sha/skills/vitest/SKILL.md')
    expect(rendered.html).toContain('https://github.com/antfu/skills/compare/old-sha...new-sha')
    expect(rendered.text).toContain('https://github.com/antfu/skills/blob/new-sha/skills/vitest/SKILL.md')
  })

  it('keeps trending secondary and renders seven rows at most', () => {
    const rendered = renderWeekly(input())

    expect(rendered.html).toContain('skill-7')
    expect(rendered.html).not.toContain('skill-8')
  })

  it('uses fluid, accessible email structure', () => {
    const rendered = renderWeekly(input())

    expect(rendered.html).not.toContain('width="600"')
    expect(rendered.html).toContain('<h1')
    expect(rendered.html).toContain('<h2')
    expect(rendered.html).toContain('alt=""')
    expect(rendered.html).not.toContain('#a8a29e')
    expect(rendered.html).not.toContain('🔥')
    expect(rendered.html).toContain('Hi Harlan,')
  })

  it('tracks explicit share intent', () => {
    const rendered = renderWeekly(input())
    expect(rendered.html).toContain('k=share')
    expect(parseWeeklyClick({ p: '/api/share/weekly', k: 'share', w: String(WINDOW_END), u: '1' }))
      .toMatchObject({ _tag: 'ok', placement: 'share' })
  })
})
