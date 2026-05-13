// @vitest-environment node
import type { MDCRoot } from '../src/runtime/types'
import { describe, expect, it } from 'vitest'
import { splitVirtualPages } from '../src/runtime/utils/virtual-pages'

function root(...children: MDCRoot['children']): MDCRoot {
  return { type: 'root', children }
}

function heading(tag: 'h1' | 'h2' | 'h3', id: string, text: string): MDCRoot['children'][number] {
  return {
    type: 'element',
    tag,
    props: { id },
    children: [{ type: 'text', value: text }],
  }
}

function para(text: string): MDCRoot['children'][number] {
  return {
    type: 'element',
    tag: 'p',
    props: undefined,
    children: [{ type: 'text', value: text }],
  }
}

describe('splitVirtualPages', () => {
  it('produces an implicit Introduction page for pre-heading content', () => {
    const body = root(
      para('Lead paragraph.'),
      heading('h1', 'intro', 'Intro'),
      para('After.'),
    )
    const pages = splitVirtualPages(body, undefined, 2)
    expect(pages.map(p => [p.slug, p.level, p.title])).toEqual([
      ['introduction', 0, 'Introduction'],
      ['intro', 1, 'Intro'],
    ])
    expect(pages[0]!.searchText).toBe('Lead paragraph.')
  })

  it('splits on H1 and H2 by default', () => {
    const body = root(
      heading('h1', 'a', 'A'),
      para('a body'),
      heading('h2', 'b', 'B'),
      para('b body'),
      heading('h1', 'c', 'C'),
    )
    const pages = splitVirtualPages(body, undefined, 2)
    expect(pages.map(p => p.slug)).toEqual(['a', 'b', 'c'])
    expect(pages[0]!.level).toBe(1)
    expect(pages[1]!.level).toBe(2)
  })

  it('only splits on H1 when pageHeadingDepth=1', () => {
    const body = root(
      heading('h1', 'a', 'A'),
      heading('h2', 'b', 'B'),
      heading('h1', 'c', 'C'),
    )
    const pages = splitVirtualPages(body, undefined, 1)
    expect(pages.map(p => p.slug)).toEqual(['a', 'c'])
  })

  it('falls back to a single Introduction page when there are no headings', () => {
    const body = root(para('only prose.'))
    const pages = splitVirtualPages(body, undefined, 2)
    expect(pages).toHaveLength(1)
    expect(pages[0]!.slug).toBe('introduction')
    expect(pages[0]!.level).toBe(0)
  })

  it('builds outline from toc.links scoped to each page', () => {
    const body = root(
      heading('h1', 'a', 'A'),
      heading('h3', 'a-1', 'A.1'),
      heading('h4', 'a-1-1', 'A.1.1'),
      heading('h2', 'b', 'B'),
      heading('h3', 'b-1', 'B.1'),
    )
    const toc = {
      title: '',
      depth: 0,
      searchDepth: 0,
      links: [{
        id: 'a',
        text: 'A',
        depth: 1,
        children: [
          { id: 'a-1', text: 'A.1', depth: 3, children: [{ id: 'a-1-1', text: 'A.1.1', depth: 4 }] },
          { id: 'b', text: 'B', depth: 2, children: [{ id: 'b-1', text: 'B.1', depth: 3 }] },
        ],
      }],
    }
    const pages = splitVirtualPages(body, toc as any, 2)
    expect(pages.find(p => p.slug === 'a')!.outline.map(o => [o.id, o.depth, o.indent]))
      .toEqual([['a-1', 3, 0], ['a-1-1', 4, 1]])
    expect(pages.find(p => p.slug === 'b')!.outline.map(o => [o.id, o.depth])).toEqual([['b-1', 3]])
  })

  it('slices per-page source using AST position offsets', () => {
    const source = '# A\n\nbody a\n\n## B\n\nbody b\n'
    const body = root(
      { type: 'element', tag: 'h1', props: { id: 'a' }, children: [{ type: 'text', value: 'A' }], position: { start: 0, end: 4 } },
      { type: 'element', tag: 'p', props: undefined, children: [{ type: 'text', value: 'body a' }], position: { start: 5, end: 12 } },
      { type: 'element', tag: 'h2', props: { id: 'b' }, children: [{ type: 'text', value: 'B' }], position: { start: 13, end: 18 } },
      { type: 'element', tag: 'p', props: undefined, children: [{ type: 'text', value: 'body b' }], position: { start: 19, end: 26 } },
    )
    const pages = splitVirtualPages(body, undefined, 2, source)
    expect(pages.find(p => p.slug === 'a')!.source).toBe('# A\n\nbody a')
    expect(pages.find(p => p.slug === 'b')!.source).toBe('## B\n\nbody b')
  })
})
