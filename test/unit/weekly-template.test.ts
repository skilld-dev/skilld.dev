import type { WeeklyRenderInput, WeeklyTrendingSkill } from '../../layers/identity/server/utils/weekly-template'
import { describe, expect, it } from 'vitest'
import { formatWindow, renderWeekly } from '../../layers/identity/server/utils/weekly-template'

const WINDOW_END = 1_755_648_000
const WINDOW_START = WINDOW_END - 7 * 86_400

function input(overrides: Partial<WeeklyRenderInput> = {}): WeeklyRenderInput {
  return {
    login: 'harlan-zw',
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    likedChanges: [],
    likedOverflow: 0,
    trackedCount: 0,
    trending: [],
    siteUrl: 'https://skilld.dev',
    unsubscribeUrl: 'https://skilld.dev/api/unsubscribe?t=abc&list=weekly',
    settingsUrl: 'https://skilld.dev/me',
    ...overrides,
  }
}

function trending(overrides: Partial<WeeklyTrendingSkill> = {}): WeeklyTrendingSkill {
  return {
    owner: 'antfu',
    repo: 'skills',
    slug: 'vitest',
    canonicalName: 'vitest',
    description: 'Testing conventions.',
    stars: 12_400,
    reason: { _tag: 'named', authorCount: 3, mentionCount: 5 },
    evidence: null,
    ...overrides,
  }
}

describe('weekly template', () => {
  it('states the star count once for a star-only row', () => {
    const { html, text } = renderWeekly(input({
      trending: [trending({ reason: { _tag: 'popular', stars: 46_712 }, stars: 46_712 })],
    }))

    expect(html.match(/47k stars/g)).toHaveLength(1)
    expect(text.match(/47k stars/g)).toHaveLength(1)
  })

  it('shortens a seven-figure star count to millions', () => {
    const { html } = renderWeekly(input({
      trending: [trending({ stars: 1_284_000 })],
    }))

    expect(html).toContain('1.3m stars')
    expect(html).not.toContain('1284k')
  })

  it('says which route named a skill rather than implying a person did', () => {
    const { html } = renderWeekly(input({
      trending: [
        trending({ slug: 'a', canonicalName: 'a', reason: { _tag: 'named', authorCount: 2, mentionCount: 4 } }),
        trending({ slug: 'b', canonicalName: 'b', reason: { _tag: 'stars', gain: 865, day: WINDOW_END - 2 * 86_400 } }),
      ],
    }))

    expect(html).toContain('2 people named it')
    expect(html).toContain('+865 stars 2d ago')
  })

  it('counts one person as a person', () => {
    const { html } = renderWeekly(input({
      trending: [trending({ reason: { _tag: 'named', authorCount: 1, mentionCount: 1 } })],
    }))

    expect(html).toContain('1 person named it')
    expect(html).not.toContain('1 people')
  })

  it('agrees the greeting verb with a single trending skill', () => {
    const { html } = renderWeekly(input({
      likedChanges: [likedChange()],
      trending: [trending()],
    }))

    expect(html).toContain('1 more is getting talked about')
  })

  it('links the skill page and shows the owner avatar for every row', () => {
    const { html } = renderWeekly(input({ likedChanges: [likedChange()] }))

    // The destination now travels as the `p` parameter of the click endpoint,
    // so the row links to the tracker and the tracker names the skill page.
    expect(html).toContain('/api/e/weekly?')
    expect(html).toContain(encodeURIComponent('/gh/antfu/skills/vitest'))
    expect(html).toContain('https://github.com/antfu.png?size=80')
  })

  it('sends the reader to the skill page in the plain-text half', () => {
    const { text } = renderWeekly(input({ likedChanges: [likedChange()] }))

    // Text clients follow a redirect poorly and show the raw URL, so the
    // untracked link is worth more there than the measurement.
    expect(text).toContain('https://skilld.dev/gh/antfu/skills/vitest')
    expect(text).not.toContain('/api/e/weekly')
  })

  it('lists up to three commit subjects on a changed skill', () => {
    const { html } = renderWeekly(input({
      likedChanges: [likedChange({
        commitMessages: ['Cover browser mode', 'Fix the watch rerun', 'Link the config docs', 'Bump the peer range'],
      })],
    }))

    expect(html).toContain('Cover browser mode')
    expect(html).toContain('Fix the watch rerun')
    expect(html).toContain('Link the config docs')
    expect(html).not.toContain('Bump the peer range')
  })

  it('shows the commits instead of the description when both exist', () => {
    const { html } = renderWeekly(input({
      likedChanges: [likedChange({
        commitMessages: ['Cover browser mode'],
        description: 'Testing conventions.',
      })],
    }))

    expect(html).toContain('Cover browser mode')
    expect(html).not.toContain('Testing conventions.')
  })

  it('falls back to the description when no revision carried a message', () => {
    const { html } = renderWeekly(input({
      likedChanges: [likedChange({ commitMessages: [], description: 'Testing conventions.' })],
    }))

    expect(html).toContain('Testing conventions.')
  })

  it('shows a repeated commit subject once', () => {
    const { html, text } = renderWeekly(input({
      likedChanges: [likedChange({ commitMessages: ['chore: bump', 'chore: bump', 'chore: bump'] })],
    }))

    expect(html.match(/chore: bump/g)).toHaveLength(1)
    expect(text.match(/chore: bump/g)).toHaveLength(1)
  })

  it('keeps a commit subject and drops its body', () => {
    const { html } = renderWeekly(input({
      likedChanges: [likedChange({ commitMessages: ['Cover browser mode\n\nLong body nobody reads'] })],
    }))

    expect(html).toContain('Cover browser mode')
    expect(html).not.toContain('Long body nobody reads')
  })

  it('cuts an overlong commit subject', () => {
    const long = `refactor: ${'rename '.repeat(30)}`
    const { html } = renderWeekly(input({ likedChanges: [likedChange({ commitMessages: [long] })] }))

    expect(html).toContain('refactor: rename')
    expect(html).toContain('\u2026')
    expect(html).not.toContain(long)
  })

  it('carries the commit subjects into the plain-text half', () => {
    const { text } = renderWeekly(input({
      likedChanges: [likedChange({ commitMessages: ['Cover browser mode', 'Fix the watch rerun'] })],
    }))

    expect(text).toContain('* Cover browser mode')
    expect(text).toContain('* Fix the watch rerun')
  })

  it('escapes markup coming from a post', () => {
    const { html } = renderWeekly(input({
      trending: [trending({
        evidence: {
          url: 'https://x.com/a/status/1',
          authorHandle: 'a',
          text: '<script>alert(1)</script>',
          platform: 'x',
        },
      })],
    }))

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('truncates a long post instead of letting it own the row', () => {
    const { html } = renderWeekly(input({
      trending: [trending({
        evidence: { url: 'https://x.com/a/status/1', authorHandle: 'a', text: 'x'.repeat(400), platform: 'x' },
      })],
    }))

    expect(html).toContain(`${'x'.repeat(179)}\u2026`)
    expect(html).not.toContain('x'.repeat(400))
  })

  it('drops link shorteners from a quoted post', () => {
    const { html, text } = renderWeekly(input({
      trending: [trending({
        evidence: {
          url: 'https://x.com/a/status/1',
          authorHandle: 'a',
          text: 'ponytail is great https://t.co/abc https://t.co/def',
          platform: 'x',
        },
      })],
    }))

    expect(html).toContain('ponytail is great')
    expect(html).not.toContain('t.co/abc')
    expect(text).not.toContain('t.co/abc')
  })

  it('cuts an agent-length description on a word boundary', () => {
    const long = 'Forces the laziest solution that actually works, simplest, shortest, most minimal. Channels a senior dev who has seen everything: question whether the task needs to exist at all.'
    const { html } = renderWeekly(input({ trending: [trending({ description: long })] }))

    expect(html).toContain('Forces the laziest solution')
    expect(html).not.toContain('needs to exist at all')
    // Cut on a word boundary: the last word before the ellipsis is a whole
    // word from the source, not half of one.
    const tail = html.match(/(\w+)\u2026/)![1]!
    expect(long).toContain(` ${tail} `)
  })

  it('leaves a short description exactly as its author wrote it', () => {
    const { html } = renderWeekly(input({ trending: [trending({ description: 'Testing conventions.' })] }))

    expect(html).toContain('Testing conventions.')
  })

  it('offers a next action when the week produced nothing', () => {
    const { html, subject } = renderWeekly(input())

    expect(subject).toBe('skilld weekly: a quiet week')
    expect(html).toContain(encodeURIComponent('/skills'))
    expect(html).not.toContain('See the full board')
  })

  it('carries the unsubscribe link in both halves', () => {
    const rendered = renderWeekly(input({ trending: [trending()] }))

    expect(rendered.html).toContain('list=weekly')
    expect(rendered.text).toContain('list=weekly')
  })

  it('reads a window inside one month as a single month', () => {
    expect(formatWindow(WINDOW_START, WINDOW_END)).toBe('13–20 Aug')
  })

  it('names both months when the window straddles one', () => {
    expect(formatWindow(1_753_920_000, 1_754_524_800)).toBe('31 Jul – 7 Aug')
  })
})

function likedChange(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'antfu',
    repo: 'skills',
    name: 'vitest',
    slug: 'vitest',
    description: 'Testing conventions.',
    changeCount: 3,
    changedAt: WINDOW_END - 2 * 86_400,
    commitMessages: [],
    ...overrides,
  } as WeeklyRenderInput['likedChanges'][number]
}

describe('weekly subject and preheader', () => {
  it('names the changed skills instead of counting them', () => {
    const { subject } = renderWeekly(input({
      likedChanges: [
        likedChange({ name: 'vitest' }),
        likedChange({ name: 'tdd' }),
        likedChange({ name: 'core-web-vitals' }),
      ],
      trending: [trending()],
    }))

    expect(subject).toBe('skilld weekly: vitest, tdd and 1 more changed')
  })

  it('names one changed skill without a tail', () => {
    const { subject } = renderWeekly(input({ likedChanges: [likedChange({ name: 'vitest' })] }))

    expect(subject).toBe('skilld weekly: vitest changed')
  })

  it('joins exactly two changed skills with and', () => {
    const { subject } = renderWeekly(input({
      likedChanges: [likedChange({ name: 'vitest' }), likedChange({ name: 'tdd' })],
    }))

    expect(subject).toBe('skilld weekly: vitest and tdd changed')
  })

  it('counts the overflow into the subject tail', () => {
    const { subject } = renderWeekly(input({
      likedChanges: [likedChange({ name: 'vitest' }), likedChange({ name: 'tdd' })],
      likedOverflow: 4,
    }))

    expect(subject).toBe('skilld weekly: vitest, tdd and 4 more changed')
  })

  it('falls back to trending names when nothing liked changed', () => {
    const { subject } = renderWeekly(input({
      trending: [
        trending({ canonicalName: 'ponytail' }),
        trending({ canonicalName: 'unlazy' }),
        trending({ canonicalName: 'last30days' }),
      ],
    }))

    expect(subject).toBe('skilld weekly: ponytail, unlazy and 1 more')
  })

  it('says the week was quiet when there is nothing to name', () => {
    expect(renderWeekly(input()).subject).toBe('skilld weekly: a quiet week')
  })

  it('gives the preheader the half the subject did not name', () => {
    const { html } = renderWeekly(input({
      likedChanges: [likedChange({ name: 'vitest' })],
      trending: [trending({ canonicalName: 'ponytail' }), trending({ canonicalName: 'unlazy' })],
    }))

    const preheader = html.match(/<div style="display:none[^>]*>([^<]*)</)![1]!
    expect(preheader).toContain('ponytail')
    // The greeting is the first visible line; repeating it in the preview pane
    // spends the slot on an echo.
    expect(preheader).not.toBe(html.match(/font-size:14px;line-height:1.6;color:[^"]*;">([^<]*)</)?.[1])
  })

  it('names only the trending half when the reader tracks nothing', () => {
    const { html } = renderWeekly(input({ trending: [trending({ canonicalName: 'ponytail' })] }))
    const preheader = html.match(/<div style="display:none[^>]*>([^<]*)</)![1]!

    expect(preheader).toBe('People named ponytail.')
  })
})

describe('weekly like prompt', () => {
  it('asks for a like when the liked half is empty but trending is not', () => {
    const { html, text } = renderWeekly(input({ trending: [trending()] }))

    expect(html).toContain('Like a skill and it shows up here the week it changes')
    expect(text).toContain('Like a skill and it shows up here the week it changes')
  })

  it('leaves the prompt out once something liked has changed', () => {
    const { html } = renderWeekly(input({
      likedChanges: [likedChange()],
      trending: [trending()],
    }))

    expect(html).not.toContain('Like a skill and it shows up here')
  })
})

describe('weekly mention freshness', () => {
  it('dates the newest mention on a named skill', () => {
    const { html } = renderWeekly(input({
      trending: [trending({
        reason: { _tag: 'named', authorCount: 5, mentionCount: 9, latestAt: WINDOW_END - 2 * 86_400 },
      })],
    }))

    expect(html).toContain('5 people named it · latest 2d ago')
  })

  it('dates the mention half of a skill that also surged', () => {
    const { html } = renderWeekly(input({
      trending: [trending({
        reason: {
          _tag: 'named-and-stars',
          authorCount: 2,
          mentionCount: 3,
          latestAt: WINDOW_END - 86_400,
          gain: 412,
          day: WINDOW_END - 2 * 86_400,
        },
      })],
    }))

    expect(html).toContain('2 people named it · latest yesterday')
    expect(html).toContain('+412 stars 2d ago')
  })

  it('says nothing about freshness when the mention carries no timestamp', () => {
    const { html } = renderWeekly(input({
      trending: [trending({ reason: { _tag: 'named', authorCount: 1, mentionCount: 1, latestAt: 0 } })],
    }))

    expect(html).toContain('1 person named it')
    expect(html).not.toContain('latest')
  })
})

describe('weekly quiet week reporting', () => {
  it('reports the size of what it watched when nothing changed', () => {
    const { html, text } = renderWeekly(input({ trackedCount: 30, trending: [trending()] }))

    expect(html).toContain('30 skills tracked')
    expect(html).toContain('no updates this week')
    expect(text).toContain('30 skills tracked, no updates this week')
  })

  it('keeps the section heading so the silence has a home', () => {
    const { html } = renderWeekly(input({ trackedCount: 30, trending: [trending()] }))

    expect(html).toContain('Skills you like')
  })

  it('counts one tracked skill as a skill', () => {
    const { html } = renderWeekly(input({ trackedCount: 1, trending: [trending()] }))

    expect(html).toContain('1 skill tracked')
  })

  it('asks for a like only when nothing is tracked at all', () => {
    const tracking = renderWeekly(input({ trackedCount: 30, trending: [trending()] }))
    const empty = renderWeekly(input({ trackedCount: 0, trending: [trending()] }))

    // Telling someone who likes 30 skills to go like a skill is the product
    // failing to notice it already worked.
    expect(tracking.html).not.toContain('Like a skill and it shows up here')
    expect(empty.html).toContain('Like a skill and it shows up here')
  })

  it('drops the tracked line once something actually changed', () => {
    const { html } = renderWeekly(input({
      trackedCount: 30,
      likedChanges: [likedChange()],
      trending: [trending()],
    }))

    expect(html).not.toContain('no updates this week')
  })

  it('stops the greeting claiming nothing is liked when 30 things are', () => {
    const { html } = renderWeekly(input({ trackedCount: 30, trending: [trending()] }))

    expect(html).not.toContain('Nothing you like changed')
  })

  it('says outright that nothing is liked yet when nothing is', () => {
    const { html } = renderWeekly(input({ trackedCount: 0, trending: [trending()] }))

    expect(html).toContain('not liked any skills yet')
  })

  it('reports a quiet week with nothing trending either', () => {
    const { html } = renderWeekly(input({ trackedCount: 30 }))

    expect(html).toContain('30 skills tracked')
    expect(html).toContain('Back next week')
  })
})
