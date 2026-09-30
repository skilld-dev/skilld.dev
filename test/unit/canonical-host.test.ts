import { describe, expect, it } from 'vitest'
import { canonicalHostRedirect } from '../../server/utils/canonical-host'

describe('canonicalHostRedirect', () => {
  it.each([
    ['www.skilld.dev', '/gh/owner/repo/skill?tab=files', 'https://skilld.dev/gh/owner/repo/skill?tab=files'],
    ['www.skilld.dev', '/', 'https://skilld.dev/'],
    ['www.skilld.dev', '/sitemap.xml', 'https://skilld.dev/sitemap.xml'],
    ['WWW.skilld.dev', '/skills', 'https://skilld.dev/skills'],
    ['www.skilld.dev:443', '/skills?q=a%20b', 'https://skilld.dev/skills?q=a%20b'],
  ])('sends %s%s to the apex', (host, path, expected) => {
    expect(canonicalHostRedirect(host, path)).toBe(expected)
  })

  it('keeps a double slash inside the path, never as a host', () => {
    expect(canonicalHostRedirect('www.skilld.dev', '//evil.example/x'))
      .toBe('https://skilld.dev//evil.example/x')
  })

  it('never lets a path without a leading slash become a userinfo host', () => {
    expect(canonicalHostRedirect('www.skilld.dev', '@evil.example'))
      .toBe('https://skilld.dev/@evil.example')
  })

  it.each([
    'skilld.dev',
    'SKILLD.DEV:8787',
    'localhost:3000',
    'preview.skilld.dev',
    'www.skilld.dev.example.com',
    'notwww.skilld.dev',
    '',
  ])('leaves %s alone', (host) => {
    expect(canonicalHostRedirect(host, '/gh/owner/repo')).toBeNull()
  })
})
