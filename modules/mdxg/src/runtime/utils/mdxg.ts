import type { MarkdownDocument, ParserOptions } from 'comark'
import type { MdxgDocument, MdxgParseOptions, MdxgSearchHit } from '../types'
import { createMarkdownParser } from 'comark'
import rangi from 'comark/plugins/rangi'
import { github } from 'rangi/themes'
import { splitVirtualPages } from './virtual-pages'

function parserOptions(options: MdxgParseOptions): ParserOptions {
  return {
    ...options.parserOptions,
    // `classPrefix: 'rangi'` and the GitHub pair keep Learn code blocks on the
    // same markup and palette as the skill renderer in `#shared/highlight`.
    plugins: [...(options.parserOptions?.plugins ?? []), rangi({ classPrefix: 'rangi', theme: github })],
  }
}

function fromDocument(
  document: MarkdownDocument,
  pageHeadingDepth: 1 | 2,
  source?: string,
): MdxgDocument {
  const pages = splitVirtualPages(document, pageHeadingDepth, source)
  return {
    document,
    pages,
    nav: pages.map(page => ({
      index: page.index,
      slug: page.slug,
      title: page.title,
      level: page.level,
    })),
    source,
  }
}

export async function parseMdxg(
  source: string,
  options: MdxgParseOptions = {},
): Promise<MdxgDocument> {
  const parse = createMarkdownParser(parserOptions(options))
  const document = await parse(source)
  return fromDocument(document, options.pageHeadingDepth ?? 2, source)
}

export function createMdxgParser(options: MdxgParseOptions = {}) {
  const parse = createMarkdownParser(parserOptions(options))
  const depth = options.pageHeadingDepth ?? 2
  let cachedSource: string | undefined
  let cachedDocument: MdxgDocument | undefined

  return async (source: string): Promise<MdxgDocument> => {
    if (source === cachedSource && cachedDocument)
      return cachedDocument
    const document = fromDocument(await parse(source), depth, source)
    cachedSource = source
    cachedDocument = document
    return document
  }
}

export function mdxgFromDocument(
  document: MarkdownDocument,
  options: { pageHeadingDepth?: 1 | 2, source?: string } = {},
): MdxgDocument {
  return fromDocument(document, options.pageHeadingDepth ?? 2, options.source)
}

export function searchMdxg(doc: MdxgDocument, query: string, limit = 20): MdxgSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q)
    return []
  const hits: MdxgSearchHit[] = []
  for (const page of doc.pages) {
    const hay = page.searchText.toLowerCase()
    let from = 0
    while (hits.length < limit) {
      const idx = hay.indexOf(q, from)
      if (idx < 0)
        break
      const start = Math.max(0, idx - 40)
      const end = Math.min(page.searchText.length, idx + q.length + 60)
      const lead = start > 0 ? '…' : ''
      const trail = end < page.searchText.length ? '…' : ''
      hits.push({
        pageIndex: page.index,
        pageSlug: page.slug,
        pageTitle: page.title,
        snippet: lead + page.searchText.slice(start, end) + trail,
        matchStart: idx - start + lead.length,
        matchEnd: idx - start + q.length + lead.length,
      })
      from = idx + q.length
    }
    if (hits.length >= limit)
      break
  }
  return hits
}
