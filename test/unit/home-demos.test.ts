import type { HomeDemoItem } from '../../app/utils/home-demos'
import { describe, expect, it } from 'vitest'
import { demoModelLabel, demoPhoneRatio, demoRecording, formatDemoDuration } from '../../app/utils/home-demos'

function demo(overrides: Partial<HomeDemoItem> = {}): HomeDemoItem {
  return {
    owner: 'emilkowalski',
    repo: 'skills',
    name: 'emil-design-eng',
    skillPath: '/gh/emilkowalski/skills/emil-design-eng',
    authorName: 'Emil Kowalski',
    sourceUrl: 'https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md',
    prompt: 'Build toast.html.',
    agent: 'Claude Code',
    model: 'claude-opus-5-5',
    recordedAt: '2026-10-06',
    shots: [
      { src: '/d.jpg', width: 1440, height: 900, alt: 'Desktop', viewport: 'desktop' },
      { src: '/m.jpg', width: 390, height: 844, alt: 'Phone', viewport: 'mobile' },
    ],
    ...overrides,
  }
}

describe('demoModelLabel', () => {
  it('names a Claude model by family and version', () => {
    expect(demoModelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(demoModelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.6')
    expect(demoModelLabel('claude-opus-4-1-20250805')).toBe('Opus 4.1')
  })

  it('keeps a model id it does not know', () => {
    expect(demoModelLabel('gpt-6-luna')).toBe('gpt-6-luna')
  })
})

describe('demoRecording', () => {
  it('gives the card the Agent logo, the model and the day, and readers the sentence', () => {
    expect(demoRecording(demo())).toEqual({
      icon: 'i-simple-icons-claude',
      model: 'Opus 5.5',
      day: '6 Oct',
      sentence: 'Agent output, recorded with Claude Code (claude-opus-5-5) on 6 Oct 2026',
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
    const long = demo({ shots: [demo().shots[0]!, { src: '/m.jpg', width: 390, height: 5091, alt: 'Phone', viewport: 'mobile' }] })
    expect(demoPhoneRatio(long)).toBeUndefined()
  })

  it('never applies to a film', () => {
    expect(demoPhoneRatio(demo({ video: { src: '/f.mp4', poster: '/p.jpg', width: 1280, height: 720, durationSeconds: 6 } }))).toBeUndefined()
  })
})
