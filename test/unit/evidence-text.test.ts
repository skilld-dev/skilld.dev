// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cleanEvidenceText, EVIDENCE_MAX_CHARS } from '../../shared/evidence-text'

describe('cleanEvidenceText', () => {
  it('drops shortener links, which say nothing to a reader', () => {
    expect(cleanEvidenceText('great skill https://t.co/Wl5gcL8asu try it'))
      .toBe('great skill try it')
  })

  it('drops full URLs as well as shortened ones', () => {
    expect(cleanEvidenceText('see https://github.com/owner/repo for details'))
      .toBe('see for details')
  })

  it('decodes the entities X sends in post text', () => {
    expect(cleanEvidenceText('Bases &amp; Canvas &lt;everything&gt;'))
      .toBe('Bases & Canvas <everything>')
  })

  it('collapses a post\'s own line breaks into prose', () => {
    expect(cleanEvidenceText('line one\n\nline two\n  line three'))
      .toBe('line one line two line three')
  })

  it('truncates a long post so one entry cannot dominate the page', () => {
    const long = `${'word '.repeat(200)}end`
    const result = cleanEvidenceText(long)
    expect(result.length).toBeLessThanOrEqual(EVIDENCE_MAX_CHARS + 1)
    expect(result.endsWith('…')).toBe(true)
  })

  it('cuts on a word boundary when one is near the limit', () => {
    const long = `${'alpha '.repeat(100)}`
    const result = cleanEvidenceText(long)
    expect(result).not.toMatch(/alph…$/)
  })

  it('still truncates scripts that do not use spaces', () => {
    // The real feed carries long Chinese posts with no word boundaries at all.
    // A word-boundary-only rule would return them at full length.
    const chinese = '今'.repeat(500)
    const result = cleanEvidenceText(chinese)
    expect(result.length).toBeLessThanOrEqual(EVIDENCE_MAX_CHARS + 1)
    expect(result.endsWith('…')).toBe(true)
  })

  it('removes a separator left pointing at a stripped link', () => {
    // Real shape from the live page: "…Bases & Canvas everything - <link>".
    // Keeping the dash made a complete sentence look truncated.
    expect(cleanEvidenceText('Bases & Canvas everything - https://t.co/abc'))
      .toBe('Bases & Canvas everything')
  })

  it('keeps real sentence punctuation', () => {
    expect(cleanEvidenceText('It works. https://t.co/abc')).toBe('It works.')
    expect(cleanEvidenceText('Does it? https://t.co/abc')).toBe('Does it?')
  })

  it('leaves a short post untouched and unmarked', () => {
    expect(cleanEvidenceText('a tidy little post')).toBe('a tidy little post')
  })

  it('returns empty for a post that was nothing but a link', () => {
    expect(cleanEvidenceText('https://t.co/abc')).toBe('')
  })
})
