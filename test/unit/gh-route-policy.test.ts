import { describe, expect, it } from 'vitest'
import { resolveGhRoute } from '../../layers/registry/server/utils/gh-route-policy'

describe('github registry route policy', () => {
  it('recovers the duplicated owner from an old Skill URL', () => {
    expect(resolveGhRoute(
      '/gh/ericzakariasson/scandinavian-design/ericzakariasson/scandinavian-design',
      '?ref=trending',
    )).toEqual({
      _tag: 'redirect',
      location: '/gh/ericzakariasson/scandinavian-design/scandinavian-design?ref=trending',
    })
  })

  it('matches GitHub owners without case sensitivity', () => {
    expect(resolveGhRoute('/gh/EricZakariasson/scandinavian-design/ericzakariasson/scandinavian-design', ''))
      .toEqual({
        _tag: 'redirect',
        location: '/gh/EricZakariasson/scandinavian-design/scandinavian-design',
      })
  })

  it('leaves current and unrelated routes unchanged', () => {
    expect(resolveGhRoute('/gh/ericzakariasson/scandinavian-design/scandinavian-design', ''))
      .toEqual({ _tag: 'pass' })
    expect(resolveGhRoute('/gh/acme/repo/someone/skill', ''))
      .toEqual({ _tag: 'pass' })
    expect(resolveGhRoute('/gh/acme/repo//acme/skill', ''))
      .toEqual({ _tag: 'pass' })
    expect(resolveGhRoute('/skills/trending', ''))
      .toEqual({ _tag: 'pass' })
  })
})
