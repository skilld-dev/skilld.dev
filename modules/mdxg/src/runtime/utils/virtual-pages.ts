import type { ElementNode, MarkdownDocument, Node } from 'comark'
import type { MdxgOutlineEntry, MdxgPage } from '../types'
import { headingDepth, isHeading, toText } from './ast'

function outline(nodes: Node[]): MdxgOutlineEntry[] {
  const headings = nodes
    .filter(isHeading)
    .filter(node => headingDepth(node) >= 3)
  if (!headings.length)
    return []
  const minDepth = Math.min(...headings.map(headingDepth))
  return headings.map(node => ({
    id: typeof node[1].id === 'string' ? node[1].id : '',
    text: toText(node).trim(),
    depth: headingDepth(node) as 3 | 4 | 5 | 6,
    indent: headingDepth(node) - minDepth,
  }))
}

function headingOffsets(source: string, pageHeadingDepth: 1 | 2): number[] {
  const offsets: number[] = []
  let offset = 0
  let fence: '`' | '~' | undefined
  let fenceLength = 0

  for (const line of source.split(/(?<=\n)/)) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1]!
      const kind = marker[0] as '`' | '~'
      if (!fence) {
        fence = kind
        fenceLength = marker.length
      }
      else if (kind === fence && marker.length >= fenceLength) {
        fence = undefined
      }
    }
    else if (!fence) {
      const heading = line.match(/^ {0,3}(#{1,6})[ \t]+/)
      if (heading && heading[1]!.length <= pageHeadingDepth)
        offsets.push(offset)
    }
    offset += line.length
  }

  return offsets
}

function sourceSlices(
  source: string | undefined,
  pageHeadingDepth: 1 | 2,
  breakCount: number,
  hasIntroduction: boolean,
): string[] {
  if (!source)
    return []
  const offsets = headingOffsets(source, pageHeadingDepth)
  if (offsets.length !== breakCount)
    return []
  const starts = hasIntroduction ? [0, ...offsets] : offsets
  return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length).replace(/\s+$/, ''))
}

function pageDocument(document: MarkdownDocument, nodes: Node[]): MarkdownDocument {
  return { ...document, nodes }
}

function flatText(nodes: Node[]): string {
  return nodes.map(toText).join('').replace(/\s+/g, ' ').trim()
}

export function splitVirtualPages(
  document: MarkdownDocument,
  pageHeadingDepth: 1 | 2 = 2,
  source?: string,
): MdxgPage[] {
  const { nodes } = document
  const breakIndices = nodes.flatMap((node, index) =>
    isHeading(node) && headingDepth(node) <= pageHeadingDepth ? [index] : [],
  )
  const hasIntroduction = (breakIndices[0] ?? nodes.length) > 0
  const slices = sourceSlices(source, pageHeadingDepth, breakIndices.length, hasIntroduction)
  const pages: MdxgPage[] = []

  if (hasIntroduction) {
    const pageNodes = nodes.slice(0, breakIndices[0] ?? nodes.length)
    if (flatText(pageNodes)) {
      pages.push({
        index: 0,
        slug: 'introduction',
        title: 'Introduction',
        level: 0,
        document: pageDocument(document, pageNodes),
        searchText: flatText(pageNodes),
        outline: outline(pageNodes),
        source: slices[0],
      })
    }
  }

  for (let index = 0; index < breakIndices.length; index++) {
    const start = breakIndices[index]!
    const end = breakIndices[index + 1] ?? nodes.length
    const heading = nodes[start] as ElementNode
    const pageNodes = nodes.slice(start, end)
    pages.push({
      index: pages.length,
      slug: typeof heading[1].id === 'string' ? heading[1].id : `page-${pages.length}`,
      title: toText(heading).trim() || 'Untitled',
      level: headingDepth(heading) as 1 | 2,
      document: pageDocument(document, pageNodes),
      searchText: flatText(pageNodes),
      outline: outline(pageNodes),
      source: slices[index + (hasIntroduction ? 1 : 0)],
    })
  }

  if (!pages.length) {
    pages.push({
      index: 0,
      slug: 'introduction',
      title: 'Introduction',
      level: 0,
      document,
      searchText: flatText(nodes),
      outline: outline(nodes),
      source,
    })
  }

  return pages
}
