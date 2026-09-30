import type { NegotiationRequest } from '../../shared/content-negotiation'
import { describe, expect, it } from 'vitest'
import { decideNegotiation } from '../../shared/content-negotiation'

const CHROME_NAVIGATION = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
const GOOGLEBOT = 'text/html,application/xhtml+xml,application/signed-exchange;v=b3,application/xml;q=0.9,*/*;q=0.8'

function page(overrides: Partial<NegotiationRequest>): NegotiationRequest {
  return { method: 'GET', path: '/skills/trending', internal: false, ...overrides }
}

// The decision reads Accept and Sec-Fetch-Dest and nothing else, so a shared
// cache that varies on those two headers can never hand one client the other
// client's representation.
describe('decideNegotiation: representation', () => {
  it.each([
    { name: 'a browser navigation', secFetchDest: 'document', accept: CHROME_NAVIGATION, expected: { _tag: 'html' } },
    { name: 'a crawler that asks for HTML', secFetchDest: undefined, accept: GOOGLEBOT, expected: { _tag: 'html' } },
    { name: 'an agent that asks for Markdown', secFetchDest: undefined, accept: 'text/markdown', expected: { _tag: 'markdown', location: '/skills/trending.md' } },
    { name: 'an agent that ranks Markdown above HTML', secFetchDest: undefined, accept: 'text/markdown, text/html;q=0.9, */*;q=0.1', expected: { _tag: 'markdown', location: '/skills/trending.md' } },
    { name: 'Markdown and HTML at equal weight, HTML first', secFetchDest: undefined, accept: 'text/html, text/markdown', expected: { _tag: 'html' } },
    { name: 'Markdown and HTML at equal weight, Markdown first', secFetchDest: undefined, accept: 'text/markdown, text/html', expected: { _tag: 'markdown', location: '/skills/trending.md' } },
    { name: 'a navigation that still prefers Markdown', secFetchDest: 'document', accept: 'text/markdown', expected: { _tag: 'markdown', location: '/skills/trending.md' } },
    { name: 'plain text only', secFetchDest: undefined, accept: 'text/plain', expected: { _tag: 'markdown', location: '/skills/trending.md' } },
    { name: 'plain text ahead of a wildcard', secFetchDest: undefined, accept: 'application/json, text/plain, */*', expected: { _tag: 'markdown', location: '/skills/trending.md' } },
    { name: 'HTML refused, anything else allowed', secFetchDest: undefined, accept: 'text/html;q=0, */*', expected: { _tag: 'markdown', location: '/skills/trending.md' } },
    { name: 'a bare wildcard', secFetchDest: undefined, accept: '*/*', expected: { _tag: 'html' } },
    { name: 'a text wildcard', secFetchDest: undefined, accept: 'text/*', expected: { _tag: 'html' } },
    { name: 'no Accept header', secFetchDest: undefined, accept: undefined, expected: { _tag: 'html' } },
    { name: 'an empty Accept header', secFetchDest: undefined, accept: '', expected: { _tag: 'html' } },
    { name: 'fetch() from a page', secFetchDest: 'empty', accept: '*/*', expected: { _tag: 'html' } },
    { name: 'Markdown refused, anything else allowed', secFetchDest: undefined, accept: 'text/markdown;q=0, text/plain;q=0, */*', expected: { _tag: 'html' } },
    { name: 'only a type the page cannot serve', secFetchDest: undefined, accept: 'image/png', expected: { _tag: 'not-acceptable' } },
  ])('$name gets $expected._tag', ({ secFetchDest, accept, expected }) => {
    expect(decideNegotiation(page({ accept, secFetchDest }))).toEqual(expected)
  })
})

describe('decideNegotiation: which requests negotiate', () => {
  it.each([
    { name: 'a POST', request: page({ method: 'POST', accept: 'text/markdown' }), reason: 'method' },
    { name: 'the module fetching its own HTML', request: page({ internal: true, accept: 'text/markdown' }), reason: 'internal' },
    { name: 'an API route', request: page({ path: '/api/skills', accept: 'text/markdown' }), reason: 'not-a-page' },
    { name: 'a build asset', request: page({ path: '/_nuxt/v2/entry.js', accept: 'text/markdown' }), reason: 'not-a-page' },
    { name: 'a file', request: page({ path: '/robots.txt', accept: 'text/markdown' }), reason: 'not-a-page' },
    { name: 'an explicit Markdown URL', request: page({ path: '/gh/a/b/c.md', accept: 'text/markdown' }), reason: 'not-a-page' },
    { name: 'a well-known URL', request: page({ path: '/.well-known/mcp', accept: 'text/markdown' }), reason: 'not-a-page' },
    { name: 'a JSON request', request: page({ accept: 'application/json' }), reason: 'data-request' },
    { name: 'an event stream', request: page({ accept: 'text/event-stream' }), reason: 'data-request' },
  ])('$name is skipped ($reason)', ({ request, reason }) => {
    expect(decideNegotiation(request)).toEqual({ _tag: 'skip', reason })
  })

  it('negotiates a HEAD request like a GET', () => {
    expect(decideNegotiation(page({ method: 'HEAD', accept: 'text/markdown' })))
      .toEqual({ _tag: 'markdown', location: '/skills/trending.md' })
  })

  it('negotiates a collection author page', () => {
    expect(decideNegotiation(page({ path: '/@harlan-zw', accept: 'text/markdown' })))
      .toEqual({ _tag: 'markdown', location: '/@harlan-zw.md' })
  })
})

describe('decideNegotiation: Markdown location', () => {
  it.each([
    { path: '/skills/trending?range=week', location: '/skills/trending.md' },
    { path: '/', location: '/index.md' },
    { path: '/gh/antfu/skills/', location: '/gh/antfu/skills.md' },
  ])('$path redirects to $location', ({ path, location }) => {
    expect(decideNegotiation(page({ path, accept: 'text/markdown' }))).toEqual({ _tag: 'markdown', location })
  })
})
