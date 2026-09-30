import { describe, expect, it } from 'vitest'
import {
  excerptSkillHtml,
  resolveSkillCommand,
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

describe('resolveSkillCommand', () => {
  it('offers the run command when the Skill ships only text', () => {
    const files = resolveSkillFileFacts({ assets: [asset('a.md', 'markdown')], total: 1 })
    expect(resolveSkillCommand(ref, files)).toEqual({
      _tag: 'run',
      command: 'npx skilld run acme/skills/lint',
    })
  })

  it('offers the run command when the Skill is only SKILL.md', () => {
    const files = resolveSkillFileFacts({ assets: [], total: 0 })
    expect(resolveSkillCommand(ref, files)._tag).toBe('run')
  })

  it('offers only install when the Skill ships code, and says why', () => {
    const files = resolveSkillFileFacts({ assets: [asset('scripts/x.sh', 'code')], total: 1 })
    const command = resolveSkillCommand(ref, files)
    expect(command._tag).toBe('install')
    if (command._tag === 'install') {
      expect(command.command).toBe('npx skilld install acme/skills/lint')
      expect(command.reason).toMatch(/code/)
    }
  })

  it('offers only install when a binary file has no known type', () => {
    const files = resolveSkillFileFacts({ assets: [asset('bin/tool', 'other')], total: 1 })
    expect(resolveSkillCommand(ref, files)._tag).toBe('install')
  })

  it('offers only install when the file list is cut short', () => {
    const files = resolveSkillFileFacts({ assets: [asset('a.md', 'markdown')], total: 400 })
    expect(resolveSkillCommand(ref, files)._tag).toBe('install')
  })
})

describe('excerptSkillHtml', () => {
  it('keeps the first heading and its intro, and drops later sections', () => {
    const html = '<h2>Title</h2>\n<p>Intro text.</p>\n<h3>Step 1</h3>\n<p>Later.</p>'
    expect(excerptSkillHtml(html)).toBe('<h2>Title</h2>\n<p>Intro text.</p>')
  })

  it('keeps text that comes before the first heading', () => {
    const html = '<p>Lead.</p>\n<h2>First</h2>\n<p>Body.</p>'
    expect(excerptSkillHtml(html)).toBe('<p>Lead.</p>')
  })

  it('returns the whole body when there is no second heading and it is short', () => {
    const html = '<h2>Only</h2>\n<p>Short.</p>'
    expect(excerptSkillHtml(html)).toBe(html)
  })

  it('cuts a long section at a paragraph boundary', () => {
    const para = `<p>${'word '.repeat(60).trim()}</p>`
    const html = `<h2>Title</h2>\n${para}\n${para}\n${para}\n${para}`
    const out = excerptSkillHtml(html, 700)!
    expect(out.length).toBeLessThanOrEqual(700)
    expect(out.endsWith('</p>')).toBe(true)
    expect(out.startsWith('<h2>Title</h2>')).toBe(true)
  })

  it('never returns unbalanced tags', () => {
    const html = '<blockquote>\n<h3>Inside</h3>\n<p>Quote.</p>\n</blockquote>\n<p>After.</p>'
    const out = excerptSkillHtml(html)
    const opens = (out?.match(/<blockquote>/g) ?? []).length
    const closes = (out?.match(/<\/blockquote>/g) ?? []).length
    expect(opens).toBe(closes)
  })

  it('returns null for an empty body', () => {
    expect(excerptSkillHtml('  ')).toBeNull()
    expect(excerptSkillHtml(null)).toBeNull()
  })
})
