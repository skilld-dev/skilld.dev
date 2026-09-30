import { describe, expect, it } from 'vitest'
import { parseReturnTo } from '#shared/return-to'

describe('parseReturnTo', () => {
  it.each([
    '//evil.example',
    '//evil.example/path',
    '/\\evil.example',
    '/\\/evil.example',
    '\\\\evil.example',
    'https://evil.example',
    'http://evil.example/me',
    'javascript:alert(1)',
    'evil.example',
    '',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '\t//evil.example',
    '/ok\u0000',
    '/ok\u007F',
    '/me\\..\\evil',
    ' //evil.example',
  ])('falls back for %j', (value) => {
    expect(parseReturnTo(value)).toBe('/me')
  })

  it('falls back for non-string input', () => {
    expect(parseReturnTo(undefined)).toBe('/me')
    expect(parseReturnTo(['/a', '/b'])).toBe('/me')
    expect(parseReturnTo(42)).toBe('/me')
  })

  it('uses the caller fallback', () => {
    expect(parseReturnTo('//evil.example', '/')).toBe('/')
  })

  it.each([
    '/me',
    '/',
    '/@harlan-zw/my-collection',
    '/gh/owner/repo/skill',
    '/cli/authorize?challenge=abc&port=1234&state=x%2Fy',
    '/skills?q=a%20b#top',
    '/%2F%2Fevil.example',
  ])('keeps the same-origin path %j', (value) => {
    expect(parseReturnTo(value)).toBe(value)
  })

  it('rejects an over-long value', () => {
    expect(parseReturnTo(`/${'a'.repeat(3000)}`)).toBe('/me')
  })
})
