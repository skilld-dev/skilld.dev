import type { MDCNode, MDCRoot, MdxgOutlineEntry, MdxgPage, Toc, TocLink } from '../types'
import { headingDepth, isHeading, toText } from './ast'

// Pre-order flatten of mdc's hierarchical toc. mdc applies rehype-slug, so the
// ids match exactly what the rendered AST headings carry — no local slugging.
function flattenToc(toc: Toc | undefined): TocLink[] {
  if (!toc?.links)
    return []
  const out: TocLink[] = []
  const visit = (links: TocLink[]) => {
    for (const link of links) {
      out.push(link)
      if (link.children?.length)
        visit(link.children)
    }
  }
  visit(toc.links)
  return out
}

// Outline = toc entries between `startId` (exclusive, the page heading) and the
// next entry of depth <= pageHeadingDepth (exclusive).
function outlineFromToc(
  flat: TocLink[],
  startIndex: number,
  pageHeadingDepth: 1 | 2,
): MdxgOutlineEntry[] {
  const entries: TocLink[] = []
  for (let i = startIndex + 1; i < flat.length; i++) {
    const link = flat[i]!
    if (link.depth <= pageHeadingDepth)
      break
    if (link.depth >= 3)
      entries.push(link)
  }
  if (!entries.length)
    return []
  const min = Math.min(...entries.map(e => e.depth))
  return entries.map(e => ({
    id: e.id,
    text: e.text,
    depth: e.depth as 3 | 4 | 5 | 6,
    indent: e.depth - min,
  }))
}

// Slice raw markdown source between a page's first child and the next page's
// first child, using AST position offsets when available. Returns undefined if
// positions aren't present (parser-dependent) so callers can fall back cleanly.
function sourceSlice(
  source: string | undefined,
  children: MDCNode[],
  startIdx: number,
  endIdx: number,
): string | undefined {
  if (!source)
    return undefined
  const startNode = children[startIdx]
  const startPos = startNode?.position?.start
  if (startPos == null)
    return undefined
  const endNode = children[endIdx]
  const endPos = endNode?.position?.start ?? source.length
  return source.slice(startPos, endPos).replace(/\s+$/, '')
}

export function splitVirtualPages(
  body: MDCRoot,
  toc: Toc | undefined,
  pageHeadingDepth: 1 | 2 = 2,
  source?: string,
): MdxgPage[] {
  const children = body.children
  const flat = flattenToc(toc)
  const breakIndices: number[] = []
  for (let i = 0; i < children.length; i++) {
    const c = children[i]!
    if (isHeading(c) && headingDepth(c) <= pageHeadingDepth)
      breakIndices.push(i)
  }

  const pages: MdxgPage[] = []

  // Implicit Introduction page from content before the first break.
  const firstBreak = breakIndices[0] ?? children.length
  if (firstBreak > 0) {
    const sub = children.slice(0, firstBreak)
    if (sub.some(n => n.type !== 'text' || n.value.trim())) {
      const pageBody: MDCRoot = { type: 'root', children: sub }
      pages.push({
        index: 0,
        slug: 'introduction',
        title: 'Introduction',
        level: 0,
        body: pageBody,
        searchText: flatText(pageBody),
        outline: [],
        source: sourceSlice(source, children, 0, firstBreak),
      })
    }
  }

  for (let i = 0; i < breakIndices.length; i++) {
    const start = breakIndices[i]!
    const end = breakIndices[i + 1] ?? children.length
    const head = children[start] as MDCNode & { type: 'element' }
    const id = typeof head.props?.id === 'string' ? head.props.id : `page-${pages.length}`
    const title = toText(head).trim() || 'Untitled'
    const pageBody: MDCRoot = { type: 'root', children: children.slice(start, end) }
    const tocIndex = flat.findIndex(l => l.id === id)
    pages.push({
      index: pages.length,
      slug: id,
      title,
      level: headingDepth(head as Parameters<typeof headingDepth>[0]) as 1 | 2,
      body: pageBody,
      searchText: flatText(pageBody),
      outline: tocIndex >= 0 ? outlineFromToc(flat, tocIndex, pageHeadingDepth) : [],
      source: sourceSlice(source, children, start, end),
    })
  }

  if (!pages.length) {
    pages.push({
      index: 0,
      slug: 'introduction',
      title: 'Introduction',
      level: 0,
      body,
      searchText: flatText(body),
      outline: [],
      source,
    })
  }

  return pages
}

function flatText(root: MDCRoot): string {
  return toText(root).replace(/\s+/g, ' ').trim()
}
