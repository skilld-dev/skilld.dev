// @vitest-environment node
import type { ElementNode, MarkdownDocument, Node } from 'comark'
import { describe, expect, it } from 'vitest'
import { splitVirtualPages } from '../src/runtime/utils/virtual-pages'

function document(...nodes: Node[]): MarkdownDocument {
  return { nodes, frontmatter: {}, meta: {} }
}

function heading(tag: 'h1' | 'h2' | 'h3' | 'h4', id: string, text: string): ElementNode {
  return [tag, { id }, text]
}

function para(text: string): ElementNode {
  return ['p', {}, text]
}

describe('splitVirtualPages', () => {
  it('produces an implicit Introduction page for pre-heading content', () => {
    const pages = splitVirtualPages(document(
      para('Lead paragraph.'),
      heading('h1', 'intro', 'Intro'),
      para('After.'),
    ))
    expect(pages.map(page => [page.slug, page.level, page.title])).toEqual([
      ['introduction', 0, 'Introduction'],
      ['intro', 1, 'Intro'],
    ])
    expect(pages[0]!.searchText).toBe('Lead paragraph.')
  })

  it('splits on H1 and H2 by default', () => {
    const pages = splitVirtualPages(document(
      heading('h1', 'a', 'A'),
      para('a body'),
      heading('h2', 'b', 'B'),
      para('b body'),
      heading('h1', 'c', 'C'),
    ))
    expect(pages.map(page => page.slug)).toEqual(['a', 'b', 'c'])
    expect(pages[0]!.level).toBe(1)
    expect(pages[1]!.level).toBe(2)
  })

  it('only splits on H1 when pageHeadingDepth=1', () => {
    const pages = splitVirtualPages(document(
      heading('h1', 'a', 'A'),
      heading('h2', 'b', 'B'),
      heading('h1', 'c', 'C'),
    ), 1)
    expect(pages.map(page => page.slug)).toEqual(['a', 'c'])
  })

  it('falls back to one Introduction page without headings', () => {
    const pages = splitVirtualPages(document(para('only prose.')))
    expect(pages).toHaveLength(1)
    expect(pages[0]!.slug).toBe('introduction')
    expect(pages[0]!.level).toBe(0)
  })

  it('builds each page outline from nested headings', () => {
    const pages = splitVirtualPages(document(
      heading('h1', 'a', 'A'),
      heading('h3', 'a-1', 'A.1'),
      heading('h4', 'a-1-1', 'A.1.1'),
      heading('h2', 'b', 'B'),
      heading('h3', 'b-1', 'B.1'),
    ))
    expect(pages.find(page => page.slug === 'a')!.outline.map(entry => [entry.id, entry.depth, entry.indent]))
      .toEqual([['a-1', 3, 0], ['a-1-1', 4, 1]])
    expect(pages.find(page => page.slug === 'b')!.outline.map(entry => [entry.id, entry.depth]))
      .toEqual([['b-1', 3]])
  })

  it('slices source at headings while ignoring fenced examples', () => {
    const source = '# A\n\n```md\n## Not a page\n```\n\n## B\n\nbody b\n'
    const pages = splitVirtualPages(document(
      heading('h1', 'a', 'A'),
      ['pre', {}, ['code', {}, '## Not a page']],
      heading('h2', 'b', 'B'),
      para('body b'),
    ), 2, source)
    expect(pages.find(page => page.slug === 'a')!.source).toBe('# A\n\n```md\n## Not a page\n```')
    expect(pages.find(page => page.slug === 'b')!.source).toBe('## B\n\nbody b')
  })
})
