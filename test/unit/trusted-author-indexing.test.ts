import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildTrustedAuthorSitemapEntries,
  isTrustedAuthorOwner,
  isTrustedAuthorRepo,
} from '../../layers/registry/server/utils/trusted-author-sources'

const repoPage = readFileSync('layers/registry/app/pages/gh/[owner]/[repo]/index.vue', 'utf8')
const ownerPage = readFileSync('layers/registry/app/pages/gh/[owner]/index.vue', 'utf8')
const nuxtConfig = readFileSync('nuxt.config.ts', 'utf8')

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

  it('connects trusted pages to dynamic robots metadata and a dedicated sitemap', () => {
    expect(ownerPage).toContain(`data.value?.seoIndexable ? 'index,follow' : 'noindex,follow'`)
    expect(repoPage).toContain(`repoSource.value?.seoIndexable ? 'index,follow' : 'noindex,follow'`)
    expect(repoPage).toContain('server: fetchRepoProfileOnServer')
    expect(nuxtConfig).toContain('sources: [\'/api/__sitemap__/trusted-authors\']')
  })
})
