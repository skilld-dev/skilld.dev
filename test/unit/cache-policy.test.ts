import { describe, expect, it } from 'vitest'
import {
  EDGE_NO_STORE,
  formatEdgeCacheControl,
  resolveEdgeCachePolicy,
} from '#shared/server/cache-policy'

describe('workers cache policy', () => {
  it.each([
    ['/api/collections', 60],
    ['/api/collections/featured', 60],
    ['/api/feed/recent-updates', 60],
    ['/api/feed/recent-publishes', 60],
    ['/api/skills-raw/cloudflare/workers/agents', 300],
    ['/api/npm-guides-raw/%40nuxt%2Fkit/3-to-4', 3600],
    ['/api/skills/tags', 300],
    ['/api/clusters', 600],
    ['/api/clusters/frameworks', 300],
    ['/api/orgs/cloudflare', 300],
    ['/api/tags/cloudflare', 300],
    ['/api/repos/cloudflare/workers-sdk', 900],
    ['/api/skill-live/cloudflare/workers/agents', 3600],
  ])('allows the public GET route %s', (pathname, maxAge) => {
    expect(resolveEdgeCachePolicy('GET', pathname, 200)?.maxAge).toBe(maxAge)
  })

  it.each([
    ['POST', '/api/collections', 200],
    ['GET', '/api/collections', 404],
    ['GET', '/api/collections/someone/list', 200],
    ['GET', '/api/me', 200],
    ['GET', '/@cloudflare', 200],
  ])('denies non-public response %s %s (%i)', (method, pathname, statusCode) => {
    expect(resolveEdgeCachePolicy(method, pathname, statusCode)).toBeNull()
  })

  it('allows HEAD only where the matching GET is public', () => {
    expect(resolveEdgeCachePolicy('HEAD', '/api/collections', 200)?.maxAge).toBe(60)
    expect(resolveEdgeCachePolicy('HEAD', '/api/me', 200)).toBeNull()
  })

  it('preserves browser caching only for raw public documents', () => {
    expect(resolveEdgeCachePolicy('GET', '/api/skills-raw/cloudflare/workers/agents', 200)?.preserveBrowserCache).toBe(true)
    expect(resolveEdgeCachePolicy('GET', '/api/collections', 200)?.preserveBrowserCache).toBeUndefined()
  })

  it('formats CDN directives without making browsers cache the response', () => {
    expect(formatEdgeCacheControl({
      maxAge: 900,
      staleWhileRevalidate: 3600,
      staleIfError: 3600,
    })).toBe('public, max-age=900, stale-while-revalidate=3600, stale-if-error=3600')
    expect(formatEdgeCacheControl(null)).toBe(EDGE_NO_STORE)
  })
})
