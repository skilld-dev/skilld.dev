import type { MarkdownDocument, ParserOptions } from 'comark'

export type MdxgParsedDocument = MarkdownDocument

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
  // Comark document scoped to this page.
  document: MdxgParsedDocument
  // Plain text for client-side search; pre-computed at parse time.
  searchText: string
  // Headings (depth 3–6) within this page.
  outline: MdxgOutlineEntry[]
  // Slice of the original markdown source for this page, when the document
  // was parsed from a raw string and AST positions are available.
  source?: string
}

export interface MdxgDocument {
  document: MdxgParsedDocument
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
  // Forwarded to Comark. Caller plugins run before the default Shiki plugin.
  parserOptions?: ParserOptions
}

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
