import { describe, expect, it } from 'vitest'
import { writingDiff } from '../../shared/writing-diff'

describe('writingDiff', () => {
  it('compares Markdown lines and keeps both file line numbers', () => {
    const rows = writingDiff('# Title\n\nOld copy\n', '# Title\n\nNew copy\n')
    expect(rows.map(({ kind, originalLine, updatedLine, text }) => ({ kind, originalLine, updatedLine, text }))).toEqual([
      { kind: 'context', originalLine: 1, updatedLine: 1, text: '# Title\n' },
      { kind: 'context', originalLine: 2, updatedLine: 2, text: '\n' },
      { kind: 'removed', originalLine: 3, updatedLine: null, text: 'Old copy\n' },
      { kind: 'added', originalLine: null, updatedLine: 3, text: 'New copy\n' },
    ])
  })

  it.each([
    ['', '# Added'],
    ['# Removed', ''],
    ['same\n', 'same'],
    ['one\r\ntwo\r\n', 'one\r\nthree\r\n'],
  ])('preserves source text, including final newline changes', (original, updated) => {
    const rows = writingDiff(original, updated)
    expect(rows.filter(row => row.kind !== 'added').map(row => row.text).join('')).toBe(original)
    expect(rows.filter(row => row.kind !== 'removed').map(row => row.text).join('')).toBe(updated)
  })

  it('highlights Markdown and fenced code without executing HTML', () => {
    const rows = writingDiff('', '# Title\n\n```ts\nconst value = "<script>"\n```')
    expect(rows[0]?.html).toContain('shj-section')
    expect(rows.find(row => row.text.includes('const'))?.html).toContain('shj-kwd')
    expect(rows.map(row => row.html).join('')).not.toContain('<script>')
    expect(rows.map(row => row.html).join('')).toContain('&lt;script&gt;')
  })
})
