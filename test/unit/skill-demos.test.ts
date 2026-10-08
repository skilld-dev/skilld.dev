import type { SkillDemoRecord } from '../../layers/registry/server/utils/skill-demos'
import { describe, expect, it } from 'vitest'
import { findSkillDemo, listDemoSitemapEntries, listShownSkillDemos, listSkillDemos, presentSkillDemo } from '../../layers/registry/server/utils/skill-demos'

const COMMIT = '41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f'

function demo(overrides: Partial<SkillDemoRecord> = {}): SkillDemoRecord {
  return {
    owner: 'anthropics',
    repo: 'skills',
    name: 'frontend-design',
    prompt: 'Build a landing page for Tidepool. Save it as index.html.',
    agent: 'Claude Code',
    agentVersion: '2.1.291',
    model: 'claude-opus-5-5',
    skillCommit: COMMIT,
    recordedAt: '2026-10-06',
    outputFile: 'index.html',
    shots: [{ file: 'desktop.jpg', width: 1440, height: 900, alt: 'Desktop screenshot', viewport: 'desktop' }],
    ...overrides,
  }
}

describe('presentSkillDemo', () => {
  it('keeps the recorded effort for the display', () => {
    expect(presentSkillDemo(demo({ effort: 'medium' }), null).effort).toBe('medium')
    expect(presentSkillDemo(demo(), null).effort).toBeNull()
  })
  it('marks a demo outdated once the Skill moves past the recorded commit', () => {
    expect(presentSkillDemo(demo(), 'a'.repeat(40)).outdated).toBe(true)
    expect(presentSkillDemo(demo(), COMMIT).outdated).toBe(false)
  })

  it('never marks a demo outdated when the current commit is unknown', () => {
    expect(presentSkillDemo(demo(), null).outdated).toBe(false)
  })

  it('serves screenshots from the media bucket and the output from the sandboxed live route', () => {
    const view = presentSkillDemo(demo(), null, 'https://media.example')
    expect(view.shots[0]?.src).toBe('https://media.example/demos/anthropics/skills/frontend-design/desktop.jpg')
    expect(view.liveUrl).toBe('/demos/anthropics/skills/frontend-design/live')
    expect(view.skillPath).toBe('/gh/anthropics/skills/frontend-design')
  })
})

describe('presentSkillDemo first-screen posters', () => {
  it('serves a tall shot with its first screen, at the shot width', () => {
    const view = presentSkillDemo(demo({
      shots: [{ file: 'desktop.jpg', width: 1440, height: 4102, alt: 'Desktop screenshot', viewport: 'desktop', poster: { file: 'desktop-poster.jpg', height: 900 } }],
    }), null, 'https://media.example')
    expect(view.shots[0]?.poster).toEqual({
      src: 'https://media.example/demos/anthropics/skills/frontend-design/desktop-poster.jpg',
      width: 1440,
      height: 900,
    })
  })

  it('gives a one-screen shot no poster, since the shot is its own first screen', () => {
    expect(presentSkillDemo(demo(), null).shots[0]?.poster).toBeNull()
  })
})

describe('presentSkillDemo for a video Skill', () => {
  it('serves the video and its poster, and offers no live page without one', () => {
    const view = presentSkillDemo(demo({
      outputFile: undefined,
      video: { file: 'video.mp4', poster: 'poster.jpg', width: 1280, height: 720, durationSeconds: 14.2 },
    }), null, 'https://media.example')
    expect(view.liveUrl).toBeNull()
    expect(view.video?.src).toBe('https://media.example/demos/anthropics/skills/frontend-design/video.mp4')
    expect(view.video?.poster).toBe('https://media.example/demos/anthropics/skills/frontend-design/poster.jpg')
  })
})

describe('findSkillDemo', () => {
  it('matches a Skill whatever the URL casing, as GitHub does', () => {
    expect(findSkillDemo('Anthropics', 'Skills', 'Frontend-Design', [demo()])?.name).toBe('frontend-design')
  })

  it('finds a Skill page only demo, so its Skill page still shows it', () => {
    expect(findSkillDemo('anthropics', 'skills', 'frontend-design', [demo({ skillPageOnly: true })])?.name).toBe('frontend-design')
  })

  it('returns nothing for a Skill without a demo', () => {
    expect(findSkillDemo('anthropics', 'skills', 'pdf', [demo()])).toBeNull()
  })
})

describe('listSkillDemos', () => {
  it('lists the newest recording first', () => {
    const older = demo({ name: 'older', recordedAt: '2026-09-01' })
    const newer = demo({ name: 'newer', recordedAt: '2026-10-06' })
    expect(listSkillDemos([older, newer]).map(entry => entry.name)).toEqual(['newer', 'older'])
  })
})

describe('listShownSkillDemos', () => {
  it('leaves out a demo whose Skill holds a run check flag, whatever its casing', () => {
    const shown = listShownSkillDemos(new Set(['anthropics/skills/flagged']), [demo({ name: 'Flagged' }), demo({ name: 'kept' })])
    expect(shown.map(entry => entry.name)).toEqual(['kept'])
  })

  it('leaves out a Skill page only demo', () => {
    const shown = listShownSkillDemos(new Set(), [demo({ name: 'own-page', skillPageOnly: true }), demo({ name: 'kept' })])
    expect(shown.map(entry => entry.name)).toEqual(['kept'])
  })
})

describe('listDemoSitemapEntries', () => {
  const six = Array.from({ length: 6 }, (_, i) => demo({ name: `skill-${i}`, recordedAt: `2026-10-0${i + 1}` }))

  it('lists the board, dated by its newest demo, and every demo page', () => {
    const entries = listDemoSitemapEntries(new Set(), six)
    expect(entries[0]).toEqual({ loc: '/skills/demos', lastmod: '2026-10-06' })
    expect(entries).toContainEqual({ loc: '/skills/demos/anthropics/skills/skill-0', lastmod: '2026-10-01' })
    expect(entries).toHaveLength(7)
  })

  it('lists nothing once flags drop the shown demos below six, where the pages answer noindex', () => {
    expect(listDemoSitemapEntries(new Set(['anthropics/skills/skill-0']), six)).toEqual([])
  })

  it('never lists a Skill page only demo, nor counts it toward six', () => {
    const [first, ...rest] = six
    expect(listDemoSitemapEntries(new Set(), [{ ...first!, skillPageOnly: true }, ...rest])).toEqual([])
  })
})

describe('recorded token usage', () => {
  it('preserves the recorded breakdown and leaves missing usage unknown', () => {
    const tokenUsage = { inputTokens: 150, cachedInputTokens: 110, outputTokens: 30 }
    expect(presentSkillDemo(demo({ tokenUsage }), null).tokenUsage).toEqual(tokenUsage)
    expect(presentSkillDemo(demo(), null).tokenUsage).toBeNull()
  })
})
