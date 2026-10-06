// @vitest-environment node
import type { PostSegment } from '../../shared/trending-post'
import { describe, expect, it } from 'vitest'
import { postExcerpt, relativeDay, unstyled } from '../../shared/trending-post'

function plain(segments: PostSegment[]): string {
  return segments.map(s => s.value).join('')
}

function mentions(segments: PostSegment[]): string[] {
  return segments.filter(s => s._tag === 'mention').map(s => s.value)
}

describe('postExcerpt', () => {
  it('keeps line breaks and drops the blank lines between them', () => {
    const excerpt = postExcerpt({ text: 'Let me show you:\n\n1. Install\n\n\n2. Prompt', names: [], budget: 200 })
    expect(plain(excerpt)).toBe('Let me show you:\n1. Install\n2. Prompt')
  })

  it('drops t.co links along with the separator that introduced them', () => {
    const excerpt = postExcerpt({
      text: '1. Superpowers - https://t.co/6GLFeCmy6D\n\n2. Ponytail - https://t.co/oi7NLZOUVR',
      names: [],
      budget: 200,
    })
    expect(plain(excerpt)).toBe('1. Superpowers\n2. Ponytail')
  })

  it('drops a t.co link wrapped in parentheses', () => {
    const excerpt = postExcerpt({ text: 'Try it (https://t.co/608FanhuRJ) today', names: [], budget: 200 })
    expect(plain(excerpt)).toBe('Try it today')
  })

  it('shortens every other link to its host and path', () => {
    const excerpt = postExcerpt({ text: 'Source: https://www.github.com/blader/humanizer', names: [], budget: 200 })
    expect(plain(excerpt)).toBe('Source: github.com/blader/humanizer')
  })

  it('marks every mention of the skill, whatever its case', () => {
    const excerpt = postExcerpt({
      text: 'npx skills add typesafe-ai/skills --skill TypeSafe-AI',
      names: ['typesafe-ai'],
      budget: 200,
    })
    expect(mentions(excerpt)).toEqual(['typesafe-ai', 'TypeSafe-AI'])
    expect(plain(excerpt)).toBe('npx skills add typesafe-ai/skills --skill TypeSafe-AI')
  })

  it('marks the spaced form of a hyphenated name', () => {
    const excerpt = postExcerpt({ text: 'My Core Data Expert skill', names: ['core-data-expert'], budget: 200 })
    expect(mentions(excerpt)).toEqual(['Core Data Expert'])
  })

  it('marks a slash command', () => {
    const excerpt = postExcerpt({ text: 'The easiest skill on Opus: /brag.', names: ['brag'], budget: 200 })
    expect(mentions(excerpt)).toEqual(['brag'])
  })

  it('never marks a name that starts inside a longer hyphenated word', () => {
    const excerpt = postExcerpt({ text: 'my agent-skill-repo setup', names: ['skill-repo'], budget: 200 })
    expect(mentions(excerpt)).toEqual([])
  })

  it('leaves a post alone when its mention falls inside the budget', () => {
    const text = 'security-audit-skill is a Cloudflare coding agent skill.'
    const excerpt = postExcerpt({ text, names: ['security-audit'], budget: 200 })
    expect(plain(excerpt)).toBe(text)
  })

  it('jumps to a mention past the budget and keeps a short first line as the lead', () => {
    const excerpt = postExcerpt({
      text: 'Top 10 skill repos:\n\n1. Superpowers\n\n2. Ponytail\n\n3. Graphify\n\n4. Caveman\n\n7. Understand Anything',
      names: ['understand'],
      budget: 40,
    })
    expect(plain(excerpt)).toBe('Top 10 skill repos:\n… 7. Understand Anything')
    expect(mentions(excerpt)).toEqual(['Understand'])
  })

  it('starts mid-line, at a word, when the mention sits deep inside one long line', () => {
    const lead = 'word '.repeat(40)
    const excerpt = postExcerpt({ text: `${lead}then humanizer fixed it`, names: ['humanizer'], budget: 60 })
    const text = plain(excerpt)
    expect(text.startsWith('… ')).toBe(true)
    expect(text.endsWith('then humanizer fixed it')).toBe(true)
    expect(text.length).toBeLessThan(80)
  })

  it('drops emoji and keeps the words around them', () => {
    const excerpt = postExcerpt({
      text: '🎉 Celebrating 🎉 (500+ new stars) 📦 blader / humanizer ⭐️ 👨‍👩‍👧 🇦🇺',
      names: [],
      budget: 200,
    })
    expect(plain(excerpt)).toBe('Celebrating (500+ new stars) blader / humanizer')
  })

  it('keeps the digit of a keycap emoji', () => {
    const excerpt = postExcerpt({ text: '1️⃣ Install\n2️⃣ Prompt', names: [], budget: 200 })
    expect(plain(excerpt)).toBe('1 Install\n2 Prompt')
  })

  it('reads Unicode bold and italic letters as plain text', () => {
    const excerpt = postExcerpt({
      text: 'as long as you 𝘀𝗵𝗼𝘄 𝗶𝘁 𝘁𝗼𝗽-𝘁𝗶𝗲𝗿 design with 𝙝𝙪𝙢𝙖𝙣𝙞𝙯𝙚𝙧',
      names: ['humanizer'],
      budget: 200,
    })
    expect(plain(excerpt)).toBe('as long as you show it top-tier design with humanizer')
    expect(mentions(excerpt)).toEqual(['humanizer'])
  })

  it('returns the tidied text as one segment when no name matches', () => {
    expect(postExcerpt({ text: '  hello\n\nworld  ', names: ['absent-skill'], budget: 200 }))
      .toEqual([{ _tag: 'text', value: 'hello\nworld' }])
  })
})

describe('unstyled', () => {
  it('returns a display name as plain letters without emoji', () => {
    expect(unstyled('𝗝𝗼𝗵𝗻 ⚡️').trim()).toBe('John')
  })
})

describe('relativeDay', () => {
  const NOW = 1_760_000_000

  it('reads the reference clock, not the current time', () => {
    expect(relativeDay(NOW - 4 * 86_400, NOW)).toBe('4d ago')
    expect(relativeDay(NOW - 4 * 86_400, NOW + 86_400)).toBe('5d ago')
  })

  it('falls back to hours inside the first day', () => {
    expect(relativeDay(NOW - 5 * 3600, NOW)).toBe('5h ago')
  })

  it('collapses anything under an hour to just now', () => {
    expect(relativeDay(NOW - 59 * 60, NOW)).toBe('just now')
  })
})
