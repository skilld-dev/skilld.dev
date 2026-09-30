import { describe, expect, it } from 'vitest'
import {
  buildTrustedAuthorSitemapEntries,
  isTrustedAuthorOwner,
  isTrustedAuthorRepo,
} from '../../layers/registry/server/utils/trusted-author-sources'

describe('trusted author indexing', () => {
  it('recognises reviewed individual authors without treating official orgs as authors', () => {
    expect(isTrustedAuthorOwner('MattPocock')).toBe(true)
    expect(isTrustedAuthorRepo('mattpocock', 'SKILLS')).toBe(true)
    expect(isTrustedAuthorOwner('anthropics')).toBe(false)
    expect(isTrustedAuthorRepo('anthropics', 'skills')).toBe(false)
  })

  it('lists trusted owner hubs and multi-skill repository hubs with stable lastmod values', () => {
    expect(buildTrustedAuthorSitemapEntries([
      { owner: 'mattpocock', repo: 'skills', skillCount: 22, updatedAt: 20 },
      { owner: 'mattpocock', repo: 'single', skillCount: 1, updatedAt: 40 },
      { owner: 'antfu', repo: 'skills', skillCount: 4, updatedAt: 30 },
    ])).toEqual([
      { loc: '/gh/antfu', changefreq: 'weekly', lastmod: '1970-01-01T00:00:30.000Z' },
      { loc: '/gh/mattpocock', changefreq: 'weekly', lastmod: '1970-01-01T00:00:40.000Z' },
      { loc: '/gh/antfu/skills', changefreq: 'weekly', lastmod: '1970-01-01T00:00:30.000Z' },
      { loc: '/gh/mattpocock/skills', changefreq: 'weekly', lastmod: '1970-01-01T00:00:20.000Z' },
    ])
  })

  it('leaves a renamed repository hub out of the sitemap, because the page renders Source not found', () => {
    const locs = buildTrustedAuthorSitemapEntries([
      { owner: 'hyf0', repo: 'vue-skills', skillCount: 5, updatedAt: 1, sourceOwner: 'vuejs-ai', sourceRepo: 'skills' },
      { owner: 'antfu', repo: 'skills', skillCount: 4, updatedAt: 1, sourceOwner: 'ANTFU', sourceRepo: 'Skills' },
    ]).map(entry => entry.loc)
    expect(locs).not.toContain('/gh/hyf0/vue-skills')
    expect(locs).toContain('/gh/antfu/skills')
    expect(locs).toContain('/gh/hyf0')
  })
})
