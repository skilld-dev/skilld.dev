import type { MdxgDocument, MdxgPage } from '../src/runtime/types'
import { describe, expect, it } from 'vitest'
import { searchMdxg } from '../src/runtime/utils/mdxg'

function page(overrides: Partial<MdxgPage> & { searchText: string, slug: string, title: string, index: number }): MdxgPage {
  return {
    document: { nodes: [], frontmatter: {}, meta: {} },
    level: 1,
    outline: [],
    ...overrides,
  }
}

function doc(pages: MdxgPage[]): MdxgDocument {
  return {
    document: { nodes: [], frontmatter: {}, meta: {} },
    pages,
    nav: pages.map(p => ({ index: p.index, slug: p.slug, title: p.title, level: p.level })),
  }
}

describe('searchMdxg', () => {
  it('returns no hits for empty query', () => {
    expect(searchMdxg(doc([page({ index: 0, slug: 'a', title: 'A', searchText: 'foo bar baz' })]), '')).toEqual([])
    expect(searchMdxg(doc([page({ index: 0, slug: 'a', title: 'A', searchText: 'foo bar baz' })]), '   ')).toEqual([])
  })

  it('finds substring matches across pages, case-insensitive', () => {
    const d = doc([
      page({ index: 0, slug: 'a', title: 'A', searchText: 'The quick brown fox.' }),
      page({ index: 1, slug: 'b', title: 'B', searchText: 'No match here.' }),
      page({ index: 2, slug: 'c', title: 'C', searchText: 'Another FOX appears.' }),
    ])
    const hits = searchMdxg(d, 'fox')
    expect(hits.map(h => h.pageSlug)).toEqual(['a', 'c'])
    expect(hits[0]!.snippet).toContain('fox')
    expect(hits[1]!.snippet).toContain('FOX')
  })

  it('reports match positions relative to the snippet', () => {
    const d = doc([page({ index: 0, slug: 'a', title: 'A', searchText: 'hello world' })])
    const [hit] = searchMdxg(d, 'world')
    expect(hit!.snippet.slice(hit!.matchStart, hit!.matchEnd)).toBe('world')
  })

  it('produces multiple hits within the same page', () => {
    const d = doc([page({ index: 0, slug: 'a', title: 'A', searchText: 'fox fox fox' })])
    const hits = searchMdxg(d, 'fox')
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hits.every(h => h.pageSlug === 'a')).toBe(true)
  })

  it('respects the limit parameter', () => {
    const d = doc([page({ index: 0, slug: 'a', title: 'A', searchText: 'x'.repeat(0) + Array.from({ length: 50 }).fill('fox').join(' ') })])
    const hits = searchMdxg(d, 'fox', 5)
    expect(hits).toHaveLength(5)
  })

  it('adds leading ellipsis for snippets that start past the beginning', () => {
    const d = doc([page({ index: 0, slug: 'a', title: 'A', searchText: `${'a'.repeat(200)} match ${'b'.repeat(200)}` })])
    const [hit] = searchMdxg(d, 'match')
    expect(hit!.snippet.startsWith('…')).toBe(true)
    expect(hit!.snippet.endsWith('…')).toBe(true)
  })
})
