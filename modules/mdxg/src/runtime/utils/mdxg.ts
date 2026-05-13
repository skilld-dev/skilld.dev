import type { MDCParserResult, MDCRoot, MdxgDocument, MdxgParseOptions, MdxgSearchHit } from '../types'
import { createCachedParser, parseMarkdown } from '@nuxtjs/mdc/runtime'
import { splitVirtualPages } from './virtual-pages'

// Default Shiki highlighter; registered by `runtime/plugin.ts` at app init
// using Nuxt's bundled `#mdc-highlighter`. parseMdxg auto-applies it when no
// caller-supplied highlighter is present.
let defaultHighlighter: ((code: string, lang: string, theme: unknown, options: unknown) => Promise<unknown>) | undefined

export function setMdxgDefaultHighlighter(fn: typeof defaultHighlighter): void {
  defaultHighlighter = fn
}

function withDefaultHighlighter(opts?: MdxgParseOptions['mdcOptions']): MdxgParseOptions['mdcOptions'] {
  if (!defaultHighlighter)
    return opts
  if (opts?.highlight === false)
    return opts
  const existing = opts?.highlight ?? {}
  if (existing && typeof existing === 'object' && typeof (existing as { highlighter?: unknown }).highlighter === 'function')
    return opts
  return {
    ...opts,
    highlight: { ...(existing as Record<string, unknown>), highlighter: defaultHighlighter as never },
  } as MdxgParseOptions['mdcOptions']
}

// Parse a raw markdown source string into an MdxgDocument.
// Delegates parsing to `@nuxtjs/mdc` (unified + remark + rehype + Shiki), then
// derives MDXG-specific structure (virtual pages, per-page outline, search).
export async function parseMdxg(
  source: string,
  options: MdxgParseOptions = {},
): Promise<MdxgDocument> {
  const parsed = await parseMarkdown(source, withDefaultHighlighter(options.mdcOptions))
  return { ...fromParsed(parsed, options.pageHeadingDepth ?? 2, source), source }
}

// Build a reusable parser that caches by source string. Suitable for server
// routes that render the same document many times (e.g. rate-limited fetch
// of upstream README files). Cache lives for the lifetime of the returned
// closure; create one per logical document type.
export function createMdxgParser(options: MdxgParseOptions = {}) {
  const cached = createCachedParser(withDefaultHighlighter(options.mdcOptions) ?? {})
  const depth = options.pageHeadingDepth ?? 2
  return async (source: string): Promise<MdxgDocument> => {
    const parsed = (await cached(source)) as MDCParserResult
    return { ...fromParsed(parsed, depth, source), source }
  }
}

// Build an MdxgDocument from an already-parsed MDC result (e.g. from
// `@nuxt/content` queryCollection results). No re-parse.
export function mdxgFromParsed(
  parsed: MDCParserResult,
  options: { pageHeadingDepth?: 1 | 2 } = {},
): MdxgDocument {
  return fromParsed(parsed, options.pageHeadingDepth ?? 2)
}

// Build an MdxgDocument from a bare MDC AST root.
export function mdxgFromAst(
  body: MDCRoot,
  options: { pageHeadingDepth?: 1 | 2, data?: Record<string, unknown> } = {},
): MdxgDocument {
  return fromParsed(
    {
      data: (options.data ?? {}) as MDCParserResult['data'],
      body,
      excerpt: undefined,
      toc: undefined,
    },
    options.pageHeadingDepth ?? 2,
  )
}

function fromParsed(parsed: MDCParserResult, pageHeadingDepth: 1 | 2, source?: string): MdxgDocument {
  const pages = splitVirtualPages(parsed.body, parsed.toc, pageHeadingDepth, source)
  return {
    data: parsed.data,
    toc: parsed.toc,
    body: parsed.body,
    excerpt: parsed.excerpt,
    pages,
    nav: pages.map(p => ({ index: p.index, slug: p.slug, title: p.title, level: p.level })),
  }
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
