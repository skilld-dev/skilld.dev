import { describe, expect, it } from 'vitest'
import { highlightCodeBody } from '../../shared/highlight'
import { skillBadgeEmbed } from '../../shared/skill-badge'

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '')
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&')

describe('highlightCodeBody', () => {
  const snippet = skillBadgeEmbed({ owner: 'antfu', repo: 'skills', name: 'vite', registryPath: '/gh/antfu/skills' })

  it('colours the badge snippet and keeps its text', () => {
    const html = highlightCodeBody(snippet, 'html')
    expect(html).toContain('--shiki-dark:')
    expect(decode(stripTags(html))).toBe(snippet)
  })

  it('escapes input when the language is unknown', () => {
    expect(highlightCodeBody('<a href="x">', 'nope-lang')).toBe('&lt;a href=&quot;x&quot;&gt;')
  })
})
