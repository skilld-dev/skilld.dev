import { describe, expect, it } from 'vitest'
import { checkWritingMaterial, parseWritingResponse } from '../../scripts/lib/writing-eval'

const documents = { 'reading-list.md': '# Reading\n\nUse [the list](https://example.com/list).', 'README.md': '# Margin\n\nCall `filterLinks`.\n\n```ts\nfilterLinks(links, "CSS")\n```', 'pr.md': '# Change\n\nRun `pnpm test`.' }
const events = (text: string) => JSON.stringify({ type: 'text', part: { text } })

describe('writing evaluation responses', () => {
  it('returns complete Markdown from an OpenCode response', () => {
    expect(parseWritingResponse(events(JSON.stringify(documents)))).toEqual(documents)
  })
  it('rejects a response with a missing document', () => {
    expect(() => parseWritingResponse(events(JSON.stringify({ 'README.md': '# Only one' })))).toThrow()
  })
  it('refuses a run that called a tool', () => {
    const trace = `${JSON.stringify({ type: 'tool_use', part: { tool: 'bash' } })}\n${events(JSON.stringify(documents))}`
    expect(() => parseWritingResponse(trace)).toThrow('tool_use')
  })
  it('does not accept output after an agent error', () => {
    expect(() => parseWritingResponse(`${events(JSON.stringify(documents))}\n${JSON.stringify({ type: 'error', error: 'provider failed' })}`)).toThrow('provider failed')
  })
})

describe('writing exact material checks', () => {
  it('accepts prose edits that preserve code and links', () => {
    const edited = { ...documents, 'pr.md': '# Change\n\nCheck it with `pnpm test`.' }
    expect(checkWritingMaterial(documents, edited)).toEqual([
      { file: 'reading-list.md', missing: [] },
      { file: 'README.md', missing: [] },
      { file: 'pr.md', missing: [] },
    ])
  })
  it('reports changed code, missing links, and commands', () => {
    const edited = { 'reading-list.md': '# Reading', 'README.md': '# Margin\n\nCall `filterLinks`.\n\n```ts\nfilterLinks([], "CSS")\n```', 'pr.md': '# Change' }
    expect(checkWritingMaterial(documents, edited)).toEqual([
      { file: 'reading-list.md', missing: ['https://example.com/list'] },
      { file: 'README.md', missing: ['```ts\nfilterLinks(links, "CSS")\n```'] },
      { file: 'pr.md', missing: ['pnpm test'] },
    ])
  })
})
