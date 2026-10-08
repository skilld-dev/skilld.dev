import type { HomeDemoItem } from '../../app/utils/home-demos'
import { describe, expect, it } from 'vitest'
import { demoPhoneRatio, demoRecording, demoSocialPicture, formatDemoDuration, homeDemoFeed } from '../../app/utils/home-demos'

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
    liveUrl: null,
    video: null,
    shots: [
      { src: '/d.jpg', width: 1440, height: 900, alt: 'Desktop', viewport: 'desktop', poster: null },
      { src: '/m.jpg', width: 390, height: 844, alt: 'Phone', viewport: 'mobile', poster: null },
    ],
    ...overrides,
  }
}

describe('homeDemoFeed', () => {
  it('keeps the teaser order, total count, and preferred comparison beyond the teaser', () => {
    const films = Array.from({ length: 7 }, (_, index) => demo({ name: `film-${index}`, makes: 'film' }))
    const pages = Array.from({ length: 4 }, (_, index) => demo({ name: `page-${index}`, makes: 'landing-page' }))
    const result = homeDemoFeed({ items: [...films, ...pages] })
    expect(result).toEqual({ items: films.slice(0, 6), previews: pages.slice(0, 3), total: 11 })
  })

  it('falls back to the first eligible group in display order', () => {
    const component = demo({ name: 'component' })
    const page = demo({ name: 'page', makes: 'landing-page' })
    const films = [demo({ name: 'film-a', makes: 'film' }), demo({ name: 'film-b', makes: 'film' })]
    const items = [component, page, ...films, demo({ name: 'other-component' })]
    expect(homeDemoFeed({ items })).toEqual({ items, previews: films, total: 5 })
  })

  it('leaves comparison empty when no group has two recordings', () => {
    const items = [demo(), demo({ makes: 'landing-page' })]
    expect(homeDemoFeed({ items })).toEqual({ items, previews: [], total: 2 })
  })

  it('keeps an empty feed empty', () => {
    expect(homeDemoFeed({ items: [] })).toEqual({ items: [], previews: [], total: 0 })
  })
})

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
