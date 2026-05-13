import type { parseMarkdown } from '@nuxtjs/mdc/runtime'

// We derive the MDC types from the `parseMarkdown` signature instead of
// importing them from `@nuxtjs/mdc` directly. The package's `typesVersions`
// field (as of 0.21) breaks root-level type resolution under bundler mode;
// the `./runtime` subpath has a clean `types` condition. Functional aliases
// also let us avoid declaring `@nuxtjs/mdc` as a hard type dep here.
export type MDCParserResult = Awaited<ReturnType<typeof parseMarkdown>>
export type MDCParseOptions = NonNullable<Parameters<typeof parseMarkdown>[1]>
export type MDCData = MDCParserResult['data']
export type MDCRoot = MDCParserResult['body']
export type MDCNode = MDCRoot['children'][number]
export type MDCElement = Extract<MDCNode, { type: 'element' }>
export type MDCText = Extract<MDCNode, { type: 'text' }>
export type Toc = MDCParserResult['toc']
export type TocLink = NonNullable<Toc>['links'][number]

export interface MdxgOutlineEntry {
  id: string
  text: string
  depth: 3 | 4 | 5 | 6
  // Visual indent relative to the shallowest heading in this page.
  indent: number
}

export interface MdxgPage {
  index: number
  slug: string
  title: string
  // 0 = implicit "Introduction" page (content before first H1/H2).
  // 1 | 2 = the heading depth that opened this page.
  level: 0 | 1 | 2
  // MDC AST sub-tree for this page. Render with <MDCRenderer :body="..." />.
  body: MDCRoot
  // Plain text for client-side search; pre-computed at parse time.
  searchText: string
  // Headings (depth 3–6) within this page.
  outline: MdxgOutlineEntry[]
  // Slice of the original markdown source for this page, when the document
  // was parsed from a raw string and AST positions are available.
  source?: string
}

export interface MdxgDocument {
  data: MDCData
  toc: Toc | undefined
  // Original AST for full-document rendering.
  body: MDCRoot
  // mdc-extracted excerpt (typically the first paragraph). Render as MDC AST.
  excerpt: MDCRoot | undefined
  pages: MdxgPage[]
  // Cross-page navigation entries in document order.
  nav: { index: number, slug: string, title: string, level: 0 | 1 | 2 }[]
  // Original markdown source if parsed from a string. Used by source mode.
  source?: string
}

export interface MdxgSearchHit {
  pageIndex: number
  pageSlug: string
  pageTitle: string
  snippet: string
  matchStart: number
  matchEnd: number
}

export type MdxgMode = 'preview' | 'source' | 'both'

export interface MdxgParseOptions {
  // Heading depth that introduces a new virtual page (default 2 → H1 + H2).
  pageHeadingDepth?: 1 | 2
  // Forwarded to `parseMarkdown` from `@nuxtjs/mdc`. Use for custom remark /
  // rehype plugins, highlight options, etc.
  mdcOptions?: MDCParseOptions
}

export type { MDCParserResult as MdxgParsedSource }

// --- Document Links (MDXG §12) --------------------------------------------

export interface MdxgLinkResolveInput {
  // Raw href as authored. Resolver is responsible for resolving against
  // `fromDocId`'s base location (MDXG §12.1 MUST).
  href: string
  // Anchor fragment without the leading `#`, if present.
  fragment: string | undefined
  // Opaque id of the currently-active document.
  fromDocId: string
}

export interface MdxgLinkResolveResult {
  // Stable id used as the cache key + history state marker. Encode versioning
  // here if upstream content can change (e.g. `gh:o/r@sha:abc/file.md`).
  docId: string
  document: MdxgDocument
  title?: string
  // Canonical URL pushed onto history when the document becomes active.
  url?: string
}

// Resolver SHOULD be isomorphic so the host can call it from server routes to
// seed initial paint. The module router calls it on the client during nav.
// Return null to fall through to default browser navigation (external links,
// non-markdown targets, etc. — MDXG §12.1 in-scope clause).
export type MdxgLinkResolver = (input: MdxgLinkResolveInput) => Promise<MdxgLinkResolveResult | null>

export type MdxgPrefetchMode = 'hover' | 'viewport' | 'none'
