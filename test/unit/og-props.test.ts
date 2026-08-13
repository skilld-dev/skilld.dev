import { describe, expect, it } from 'vitest'
import { ogCount, ogInitials, ogText, ogTextList } from '../../app/utils/og-props'

describe('ogText', () => {
  it('keeps a string', () => {
    expect(ogText('harlan-zw')).toBe('harlan-zw')
  })

  it('reads a numeric login as text', () => {
    // `/gh/24601` round-tripped through the OG image URL as a number.
    expect(ogText(24601)).toBe('24601')
  })

  it('falls back to empty for anything without text', () => {
    expect(ogText(undefined)).toBe('')
    expect(ogText(null)).toBe('')
    expect(ogText(Number.NaN)).toBe('')
    expect(ogText({ handle: 'x' })).toBe('')
  })
})

describe('ogCount', () => {
  it('keeps a whole count', () => {
    expect(ogCount(12)).toBe(12)
  })

  it('reads a count that arrived as text', () => {
    expect(ogCount('12')).toBe(12)
  })

  it('floors a fraction and clamps a negative', () => {
    expect(ogCount(2.7)).toBe(2)
    expect(ogCount(-5)).toBe(0)
  })

  it('falls back to zero for anything uncountable', () => {
    expect(ogCount(undefined)).toBe(0)
    expect(ogCount('many')).toBe(0)
    expect(ogCount(['1'])).toBe(0)
  })
})

describe('ogTextList', () => {
  it('keeps the text entries of a list', () => {
    expect(ogTextList(['a', 2, '', null])).toEqual(['a', '2'])
  })

  it('falls back to empty for a non-list', () => {
    expect(ogTextList('a,b')).toEqual([])
    expect(ogTextList(undefined)).toEqual([])
  })
})

describe('ogInitials', () => {
  it('takes up to two initials', () => {
    expect(ogInitials('Harlan Wilton')).toBe('HW')
    expect(ogInitials('Ada Byron Lovelace')).toBe('AB')
  })

  it('handles a numeric login without throwing', () => {
    expect(ogInitials(24601)).toBe('2')
  })

  it('is empty when there is no name', () => {
    expect(ogInitials(undefined)).toBe('')
    expect(ogInitials('')).toBe('')
  })
})
