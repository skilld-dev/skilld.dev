/**
 * HTML or Markdown for a page URL, decided from `Accept` and `Sec-Fetch-Dest`
 * alone.
 *
 * Workers Cache answers a hit without running the Worker, and it keys a stored
 * response on the URL plus the request headers named in `Vary`. A decision
 * that read `User-Agent` needed `Vary: User-Agent`, which splits the cache per
 * browser build and still let an agent and a browser that sent the same two
 * headers see each other's answer. Reading only the headers we vary on keeps
 * a stored response correct for every request that can match it.
 *
 * The rules follow nuxt-ai-ready's own negotiation, minus its User-Agent step.
 * A bare wildcard Accept and a missing Accept both admit HTML, so they get
 * HTML: search crawlers and link unfurlers send them too. An agent that wants
 * Markdown asks for it, or follows the `Link: rel="alternate"` header that
 * every HTML page still carries.
 */

/**
 * The request headers that select a stored page response. The one place the
 * `Vary` value is composed.
 *
 * `Host` keeps www apart from the apex. Workers Cache keys on the path, not
 * the hostname, so without it a stored apex page answers a www request and the
 * canonical-host redirect never runs.
 */
const NEGOTIATION_VARY_FIELDS = ['Accept', 'Sec-Fetch-Dest', 'Host']

export const NEGOTIATION_VARY = NEGOTIATION_VARY_FIELDS.join(', ')

/** True when `vary` names exactly the negotiation fields, in any order or case. */
export function varyKeysEdgeCache(vary: string | null | undefined): boolean {
  const fields = new Set((vary ?? '').split(',').map(field => field.trim().toLowerCase()).filter(Boolean))
  return fields.size === NEGOTIATION_VARY_FIELDS.length
    && NEGOTIATION_VARY_FIELDS.every(field => fields.has(field.toLowerCase()))
}

/** Set by nuxt-ai-ready when it fetches a page's HTML to convert it. */
export const AI_READY_INTERNAL_HEADER = 'x-ai-ready-internal'

export interface NegotiationRequest {
  method: string
  /** Path with an optional query string. */
  path: string
  accept?: string
  secFetchDest?: string
  /** The request came from our own renderer or prerenderer, never a client. */
  internal: boolean
}

export type NegotiationDecision
  = | { _tag: 'skip', reason: 'method' | 'internal' | 'not-a-page' }
    | { _tag: 'html' }
    | { _tag: 'markdown', location: string }
    | { _tag: 'not-acceptable' }

type Representation = 'html' | 'markdown' | 'not-acceptable'

// `/b/` serves the SVG README badges.
const RESERVED_PATH_RE = /^\/(?:api(?:\/|$)|_|b\/|\.well-known(?:\/|$)|@(?:id|fs|vite|react-refresh)(?:\/|$))/
const DATA_ACCEPT_RE = /\b(?:application\/json|text\/event-stream)\b/i
const DOCUMENT_ACCEPT_RE = /text\/(?:html|markdown|plain)\b|\*\/\*/i
const MARKDOWN_TYPES = new Set(['text/markdown', 'text/plain'])
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml'])
const WILDCARD_TYPES = new Set(['*/*', 'text/*'])

export function decideNegotiation(request: NegotiationRequest): NegotiationDecision {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return { _tag: 'skip', reason: 'method' }
  if (request.internal)
    return { _tag: 'skip', reason: 'internal' }

  const path = withoutQuery(request.path)
  if (!isPagePath(path))
    return { _tag: 'skip', reason: 'not-a-page' }

  const accept = request.accept ?? ''
  // A data client keeps the page it always got, never a 406 or a redirect.
  if (DATA_ACCEPT_RE.test(accept) && !DOCUMENT_ACCEPT_RE.test(accept))
    return { _tag: 'html' }

  const representation = representationFor(accept, request.secFetchDest)
  if (representation === 'markdown')
    return { _tag: 'markdown', location: markdownPath(path) }
  if (representation === 'not-acceptable')
    return { _tag: 'not-acceptable' }
  return { _tag: 'html' }
}

/**
 * An explicit preference for Markdown wins, even on a navigation. Otherwise a
 * navigation gets HTML, and anything else gets whatever its Accept ranks
 * higher, with HTML winning a tie.
 */
function representationFor(accept: string, secFetchDest: string | undefined): Representation {
  const ranked = rankAccept(accept)
  if (ranked === 'markdown')
    return 'markdown'
  if (secFetchDest === 'document')
    return 'html'
  return ranked
}

interface Best { q: number, position: number }

function rankAccept(accept: string): Representation {
  if (!accept.trim())
    return 'html'

  let markdown: Best | null = null
  let html: Best | null = null
  let wildcard: Best | null = null
  let rejectedMarkdown = false
  let rejectedHtml = false
  let sawEntry = false

  for (const [position, part] of accept.split(',').entries()) {
    const [rawType = '', ...params] = part.split(';')
    const type = rawType.trim().toLowerCase()
    if (!type)
      continue
    sawEntry = true
    const q = quality(params)
    if (MARKDOWN_TYPES.has(type)) {
      if (q === 0)
        rejectedMarkdown = true
      else
        markdown = better(markdown, { q, position })
    }
    else if (HTML_TYPES.has(type)) {
      if (q === 0)
        rejectedHtml = true
      else
        html = better(html, { q, position })
    }
    else if (WILDCARD_TYPES.has(type) && q > 0) {
      wildcard = better(wildcard, { q, position })
    }
  }

  if (!sawEntry)
    return 'html'

  const md = markdown ?? (rejectedMarkdown ? null : wildcard)
  const ht = html ?? (rejectedHtml ? null : wildcard)
  if (!md && !ht)
    return 'not-acceptable'
  if (!md)
    return 'html'
  if (!ht)
    return 'markdown'
  if (md.q > ht.q || (md.q === ht.q && md.position < ht.position))
    return 'markdown'
  return 'html'
}

function better(current: Best | null, next: Best): Best {
  return current && current.q >= next.q ? current : next
}

function quality(params: string[]): number {
  for (const param of params) {
    const [name, value] = param.split('=')
    if (name?.trim().toLowerCase() === 'q') {
      const q = Number(value?.trim())
      return Number.isFinite(q) ? Math.min(Math.max(q, 0), 1) : 0
    }
  }
  return 1
}

function isPagePath(path: string): boolean {
  if (RESERVED_PATH_RE.test(path))
    return false
  const lastSegment = path.replace(/\/+$/, '').split('/').pop() ?? ''
  return !lastSegment.includes('.')
}

function markdownPath(path: string): string {
  const normalized = path.replace(/\/+$/, '')
  return normalized ? `${normalized}.md` : '/index.md'
}

function withoutQuery(path: string): string {
  const index = path.indexOf('?')
  return index === -1 ? path : path.slice(0, index)
}
