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

  it('rejects owner and repository segments GitHub could never issue', () => {
    // Real paths from the 2026-09 crawl trap, as the Worker received them.
    expect(resolveGhRoute('/gh/www.deepseek.com%20on%20skilld%20%C2%B7%20skilld', ''))
      .toEqual({ _tag: 'not-found' })
    expect(resolveGhRoute('/gh/mvanhorn/www.thriftbooks.com%60)%20skills%20%C2%B7%20skilld', ''))
      .toEqual({ _tag: 'not-found' })
    expect(resolveGhRoute('/gh/www.hackingwithswift.com+on+skilld', ''))
      .toEqual({ _tag: 'not-found' })
    expect(resolveGhRoute(`/gh/${'a'.repeat(40)}`, ''))
      .toEqual({ _tag: 'not-found' })
    expect(resolveGhRoute(`/gh/acme/${'r'.repeat(101)}`, ''))
      .toEqual({ _tag: 'not-found' })
  })

  it('passes every segment shape a registry page serves', () => {
    for (const path of [
      '/gh/vueuse',
      '/gh/vueuse.md',
      '/gh/vueuse/',
      '/gh/thedivergentai/GD-Agentic-Skills',
      '/gh/jakubantalik/transitions.dev/transitions-dev',
      '/gh/foo/my_repo.v2/skill',
      '/gh/tag/data-race',
      '/gh/acme/repo/skill/-/references/Weird%20File%20(1).md',
    ]) {
      expect(resolveGhRoute(path, '')).toEqual({ _tag: 'pass' })
    }
  })
})
