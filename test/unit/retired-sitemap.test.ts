// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildRetiredSitemapEntries, isRetiredSitemapActive } from '../../layers/registry/server/utils/retired-sitemap'

const base = {
  goneSkillPaths: ['/gh/o/r/gone'],
  deletedCollectionPaths: ['/@harlan-zw/old'],
  probedPaths: ['/orgs/acme', '/gh/o/r/gone'],
}

describe('buildRetiredSitemapEntries', () => {
  it('merges every source once, sorted, each with the same stable lastmod', () => {
    const now = new Date('2026-10-02T08:30:00Z')
    const entries = buildRetiredSitemapEntries({ now, ...base })
    expect(entries.map(e => e.loc)).toEqual(['/@harlan-zw/old', '/gh/o/r/gone', '/orgs/acme'])
    expect(new Set(entries.map(e => e.lastmod))).toEqual(new Set(['2026-09-30']))
  })

  it('keeps lastmod fixed however late it regenerates', () => {
    const early = buildRetiredSitemapEntries({ now: new Date('2026-10-01T00:00:00Z'), ...base })
    const late = buildRetiredSitemapEntries({ now: new Date('2026-11-01T12:00:00Z'), ...base })
    expect(late).toEqual(early)
  })

  it('drops anything that is not a site path', () => {
    const entries = buildRetiredSitemapEntries({ now: new Date('2026-10-02T00:00:00Z'), ...base, probedPaths: ['https://evil.example/x', 'relative'] })
    expect(entries.map(e => e.loc)).toEqual(['/@harlan-zw/old', '/gh/o/r/gone'])
  })

  it('goes empty on the removal date', () => {
    expect(isRetiredSitemapActive(new Date('2026-11-10T23:59:59Z'))).toBe(true)
    expect(buildRetiredSitemapEntries({ now: new Date('2026-11-11T00:00:00Z'), ...base })).toEqual([])
  })
})
