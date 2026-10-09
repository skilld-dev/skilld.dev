import { describe, expect, it } from 'vitest'
import { parseSkillDemoRecord, presentSkillDemo } from '../../layers/registry/server/utils/skill-demos'
import { renderWritingMarkdown } from '../../shared/writing-markdown'

const writing = {
  documents: [{ id: 'article', label: 'Blog article', format: 'article', original: '# Original', baseline: '# Baseline', output: '# Rewrite' }],
}

const recording = {
  owner: 'writer',
  repo: 'skills',
  name: 'edit',
  makes: 'writing',
  prompt: 'Edit the supplied document.',
  agent: 'Codex',
  agentVersion: '1',
  model: 'test-model',
  skillCommit: 'a'.repeat(40),
  recordedAt: '2026-10-09',
  shots: [],
  writing,
}

describe('writing demo recordings', () => {
  it('presents Markdown documents without screenshots or a live iframe', () => {
    const demo = parseSkillDemoRecord(recording)
    const view = presentSkillDemo(demo, null)
    expect(view.writing).toEqual(writing)
    expect(view.liveUrl).toBeNull()
    expect(view.shots).toEqual([])
  })

  it.each([
    { ...recording, writing: { documents: [] } },
    { ...recording, writing: { documents: [{ ...writing.documents[0], output: '  ' }] } },
    { ...recording, writing: { documents: [writing.documents[0], writing.documents[0]] } },
    { ...recording, makes: 'landing-page' },
    { ...recording, outputFile: 'index.html' },
    { ...recording, writing: undefined },
  ])('rejects an incomplete or ambiguous writing recording', (input) => {
    expect(() => parseSkillDemoRecord(input)).toThrow()
  })
})

describe('renderWritingMarkdown', () => {
  it('highlights fenced code and escapes unsupported languages', () => {
    const html = renderWritingMarkdown('```ts\nconst total = 1\n```\n\n```unknown\n<script>alert(1)</script>\n```')
    expect(html).toContain('class="shj-kwd"')
    expect(html).toContain('>const</span>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('renders GitHub tables, strikethrough, and disabled task lists', () => {
    const html = renderWritingMarkdown('| Status |\n| --- |\n| Ready |\n\n- [x] Checked\n\n~~Removed~~')
    expect(html).toContain('<table>')
    expect(html).toContain('<del>Removed</del>')
    expect(html).toContain('disabled=""')
    expect(html).toContain('checked=""')
  })
  it('renders headings, lists, links, and literal code', () => {
    const html = renderWritingMarkdown('# Read\n\n- Keep it short\n\n[Source](https://example.com)\n\n```ts\nconst tag = "<script>"\n```')
    expect(html).toContain('<h1>Read</h1>')
    expect(html).toContain('<li>Keep it short</li>')
    expect(html).toContain('href="https://example.com/"')
    expect(html).toContain('&lt;script&gt;')
  })

  it('does not execute raw HTML, component syntax, images, or unsafe links', () => {
    const html = renderWritingMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n::danger\n::\n\n[Run](javascript:alert%281%29)\n\n[Encoded](&#106;avascript:alert%281%29)\n\n![Image](https://tracker.example/image)')
    expect(html).not.toMatch(/<script|<img|onerror=|href="javascript:/i)
    expect(html).toContain('Run')
    expect(html).toContain('Image')
  })
})
