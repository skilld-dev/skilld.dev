import type { HomeDemoItem } from '../../app/utils/home-demos'
import { describe, expect, it } from 'vitest'
import { demoPhoneRatio, demoRecording, demoSocialPicture, formatDemoDuration } from '../../app/utils/home-demos'

function demo(overrides: Partial<HomeDemoItem> = {}): HomeDemoItem {
  return {
    owner: 'emilkowalski',
    repo: 'skills',
    name: 'emil-design-eng',
    skillPath: '/gh/emilkowalski/skills/emil-design-eng',
    authorName: 'Emil Kowalski',
    sourceUrl: 'https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md',
    makes: 'ui-component',
    prompt: 'Build toast.html.',
    agent: 'Claude Code',
    model: 'claude-opus-5-5',
    recordedAt: '2026-10-06',
    shots: [
      { src: '/d.jpg', width: 1440, height: 900, alt: 'Desktop', viewport: 'desktop', poster: null },
      { src: '/m.jpg', width: 390, height: 844, alt: 'Phone', viewport: 'mobile', poster: null },
    ],
    ...overrides,
  }
}

describe('demoRecording', () => {
  it('gives the card the Agent logo and the model, and readers the sentence', () => {
    expect(demoRecording(demo())).toEqual({
      icon: 'i-simple-icons-claude',
      model: 'Opus 5.5',
      sentence: 'Recorded with Claude Code, Opus 5.5',
    })
  })

  it('falls back to a generic logo for an Agent without one', () => {
    expect(demoRecording(demo({ agent: 'Aider' })).icon).toBe('i-lucide-bot')
  })
})

describe('formatDemoDuration', () => {
  it('reads seconds as minutes and seconds', () => {
    expect(formatDemoDuration(14)).toBe('0:14')
    expect(formatDemoDuration(75)).toBe('1:15')
    expect(formatDemoDuration(59.6)).toBe('1:00')
  })
})

describe('demoPhoneRatio', () => {
  it('shows a one-screen phone page whole', () => {
    expect(demoPhoneRatio(demo())).toBe('390 / 844')
  })

  it('leaves a long phone page to the take frame', () => {
    const long = demo({ shots: [demo().shots[0]!, { src: '/m.jpg', width: 390, height: 5091, alt: 'Phone', viewport: 'mobile', poster: null }] })
    expect(demoPhoneRatio(long)).toBeUndefined()
  })

  it('never applies to a film', () => {
    expect(demoPhoneRatio(demo({ video: { src: '/f.mp4', poster: '/p.jpg', width: 1280, height: 720, durationSeconds: 6 } }))).toBeUndefined()
  })
})

describe('demoSocialPicture', () => {
  const film = { src: 'https://media.example/f.mp4', poster: 'https://media.example/p.jpg', width: 1280, height: 720, durationSeconds: 6 }

  it('shows a one-screen page as its desktop shot', () => {
    expect(demoSocialPicture(demo())).toEqual({ src: '/d.jpg', width: 1440, height: 900 })
  })

  it('shows a long page as its first screen, never the whole page', () => {
    const long = demo({
      shots: [{ src: '/d.jpg', width: 1440, height: 6000, alt: 'Desktop', viewport: 'desktop', poster: { src: '/d-poster.jpg', width: 1440, height: 900 } }],
    })
    expect(demoSocialPicture(long)).toEqual({ src: '/d-poster.jpg', width: 1440, height: 900 })
  })

  it('shows a film as its poster frame', () => {
    expect(demoSocialPicture(demo({ video: film }))).toEqual({ src: 'https://media.example/p.jpg', width: 1280, height: 720 })
  })

  it('gives no picture for a long page that has no first screen', () => {
    expect(demoSocialPicture(demo({ shots: [{ src: '/d.jpg', width: 1440, height: 6000, alt: 'Desktop', viewport: 'desktop', poster: null }] }))).toBeUndefined()
  })

  it('gives no picture for a demo recorded only on a phone', () => {
    expect(demoSocialPicture(demo({ shots: [{ src: '/m.jpg', width: 390, height: 844, alt: 'Phone', viewport: 'mobile', poster: null }] }))).toBeUndefined()
  })
})
