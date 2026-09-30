import { describe, expect, it } from 'vitest'
import {
  countHtmlWords,
  excerptSkillHtml,
  resolveSkillCommands,
  resolveSkillFileFacts,
} from '../../layers/registry/app/utils/skill-unique-value'

const ref = { owner: 'acme', repo: 'skills', name: 'lint' }

function asset(path: string, type: 'markdown' | 'code' | 'image' | 'data' | 'other') {
  return { path, size: 10, type }
}

describe('resolveSkillFileFacts', () => {
  it('reports a Skill that is only SKILL.md', () => {
    expect(resolveSkillFileFacts({ assets: [], total: 0 })).toEqual({
      _tag: 'only-skill-md',
    })
  })

  it('counts files by type and lists code files', () => {
    const facts = resolveSkillFileFacts({
      assets: [
        asset('references/a.md', 'markdown'),
        asset('references/b.md', 'markdown'),
        asset('scripts/run.py', 'code'),
        asset('data.json', 'data'),
      ],
      total: 4,
    })
    expect(facts).toEqual({
      _tag: 'has-files',
      total: 4,
      markdown: 2,
      code: 1,
      other: 0,
      codePaths: ['scripts/run.py'],
      complete: true,
    })
  })

  it('marks a truncated list as incomplete', () => {
    const facts = resolveSkillFileFacts({ assets: [asset('a.md', 'markdown')], total: 300 })
    expect(facts._tag === 'has-files' && facts.complete).toBe(false)
  })
})

describe('resolveSkillCommands', () => {
  it('leads with run and offers install as the opt-in', () => {
    expect(resolveSkillCommands(ref)).toEqual({
      run: 'npx skilld run acme/skills/lint',
      install: 'npx skilld install acme/skills/lint',
    })
  })
})

const words = (n: number, w = 'word') => Array.from({ length: n }).fill(w).join(' ')
const sentences = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} says something.`).join(' ')

describe('excerptSkillHtml', () => {
  it('keeps the first heading with its body text', () => {
    const html = `<h2>Title</h2>\n<p>Intro text.</p>\n<ul>\n<li>one</li>\n</ul>\n<h3>Next</h3>\n<p>${words(200)}</p>`
    const out = excerptSkillHtml(html)!
    expect(out).toContain('<p>Intro text.</p>')
    expect(out).toContain('<li>one</li>')
  })

  it('adds the second section when the first is short', () => {
    const html = `<h2>One</h2>\n<p>${words(20)}</p>\n<h2>Two</h2>\n<p>Second body.</p>\n<h2>Three</h2>\n<p>Never shown.</p>`
    const out = excerptSkillHtml(html)!
    expect(out).toContain('Second body.')
    expect(out).not.toContain('Never shown.')
  })

  it('skips ahead when the first section is only a heading', () => {
    const html = '<h2>Writing Plans</h2>\n<h3>Overview</h3>\n<p>The real body starts here.</p>\n<h3>Later</h3>\n<p>Not shown.</p>'
    const out = excerptSkillHtml(html)!
    expect(out).toContain('The real body starts here.')
    expect(out).not.toContain('Not shown.')
  })

  it('returns null when the page holds only headings', () => {
    expect(excerptSkillHtml('<h2>A</h2>\n<h3>B</h3>')).toBeNull()
  })

  it('does not add the second section when the first is long enough', () => {
    const html = `<h2>One</h2>\n<p>${words(130)}</p>\n<h2>Two</h2>\n<p>Second body.</p>`
    expect(excerptSkillHtml(html)!).not.toContain('Second body.')
  })

  it('caps a long section at a block boundary', () => {
    const para = `<p>${words(100)}</p>`
    const html = `<h2>Title</h2>\n${para}\n${para}\n${para}\n${para}`
    const out = excerptSkillHtml(html, { maxWords: 250 })!
    expect(countHtmlWords(out)).toBeLessThanOrEqual(250)
    expect(out.endsWith('</p>')).toBe(true)
    expect((out.match(/<p>/g) ?? []).length).toBe(2)
  })

  it('cuts a single oversized paragraph at a sentence end', () => {
    const html = `<h2>Title</h2>\n<p>${sentences(80)}</p>`
    const out = excerptSkillHtml(html, { maxWords: 100 })!
    expect(countHtmlWords(out)).toBeLessThanOrEqual(100)
    expect(out).toMatch(/says something\.<\/p>$/)
  })

  it('cuts an oversized list at an item boundary', () => {
    const items = Array.from({ length: 60 }, (_, i) => `<li>item ${i} ${words(4)}</li>`).join('\n')
    const out = excerptSkillHtml(`<h2>Title</h2>\n<ul>\n${items}\n</ul>`, { maxWords: 50 })!
    expect(countHtmlWords(out)).toBeLessThanOrEqual(50)
    expect(out.endsWith('</li>\n</ul>')).toBe(true)
  })

  it('drops a block that repeats the description', () => {
    const description = 'Use when you have a spec, before touching code'
    const html = `<h2>Title</h2>\n<p>${description}</p>\n<p>Actual guidance.</p>`
    const out = excerptSkillHtml(html, { description })!
    expect(out).not.toContain('before touching code')
    expect(out).toContain('Actual guidance.')
  })

  it('keeps a short code fence and drops a long one', () => {
    const short = '<pre><code>npm run build</code></pre>'
    const long = `<pre><code>${Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')}</code></pre>`
    const out = excerptSkillHtml(`<h2>T</h2>\n<p>Intro.</p>\n${short}\n${long}`)!
    expect(out).toContain('npm run build')
    expect(out).not.toContain('line 29')
  })

  it('never returns unbalanced tags', () => {
    const html = '<blockquote>\n<h3>Inside</h3>\n<p>Quote.</p>\n</blockquote>\n<p>After.</p>'
    const out = excerptSkillHtml(html)!
    expect((out.match(/<blockquote>/g) ?? []).length).toBe((out.match(/<\/blockquote>/g) ?? []).length)
  })

  it('returns null for an empty body', () => {
    expect(excerptSkillHtml('  ')).toBeNull()
    expect(excerptSkillHtml(null)).toBeNull()
  })
})
