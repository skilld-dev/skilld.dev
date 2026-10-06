import type { SmokeFetch } from '../../scripts/lib/production-smoke'
import { describe, expect, it, vi } from 'vitest'
import {
  ASSET_COHERENCE_PATH,
  evaluateSmokeObservation,
  PRODUCTION_SMOKE_EXPECTATIONS,
  runProductionSmoke,
} from '../../scripts/lib/production-smoke'

describe('production smoke contract', () => {
  it.each([
    [500, '<h1>Server error</h1>', 'status_mismatch'],
    [200, '<h1>Skill unavailable</h1>', 'content_missing'],
    [200, '<script>{"name":"skill-creator"}</script>', 'content_missing'],
  ])('rejects a broken Skill page with status %s', async (status, body, reason) => {
    const path = '/gh/anthropics/skills/skill-creator'
    const result = await runProductionSmoke({
      baseUrl: 'https://skilld.dev',
      attempts: 1,
      wait: async () => {},
      fetch: async (input) => {
        const url = new URL(input)
        if (url.pathname === path)
          return new Response(body, { status })
        const expectation = PRODUCTION_SMOKE_EXPECTATIONS.find(item => item.path === `${url.pathname}${url.search}`)
        const content = expectation?.bodyContains?.join('') ?? ''
        return new Response(`${content}${url.pathname === ASSET_COHERENCE_PATH ? '<script src="/_nuxt/v2/app.js"></script>' : ''}`, {
          status: expectation?.status ?? 200,
          headers: { 'content-type': 'text/html', ...(expectation?.location ? { location: expectation.location } : {}) },
        })
      },
    })
    expect(result).toEqual({
      _tag: 'failed',
      failures: [expect.objectContaining({ path, result: expect.objectContaining({ reason }) })],
    })
  })

  it('covers the public routes implicated by the closed incidents', () => {
    expect(PRODUCTION_SMOKE_EXPECTATIONS).toEqual(expect.arrayContaining([
      // The homepage asserts its own hero words, because the page's error
      // branch renders an h1 too.
      { path: '/', status: 200, bodyContains: ['<h1', 'Hyped agent skills'] },
      { path: '/alt', status: 301, location: '/' },
      { path: '/skills', status: 200, bodyContains: ['<h1'] },
      { path: '/community', status: 200, bodyContains: ['<h1'] },
      { path: '/collections', status: 301, location: '/community' },
      { path: '/guides', status: 410 },
      { path: '/guides/npm/example', status: 410 },
      { path: ASSET_COHERENCE_PATH, status: 200 },
      { path: '/skills/not-a-real-outcome', status: 404 },
      { path: '/collections/_CollectionAvatar', status: 404 },
      { path: '/skills/tag/plan', status: 301, location: '/skills/planning' },
      { path: '/skills/plan', status: 301, location: '/skills/planning' },
      { path: '/skills/leaderboard', status: 301, location: '/skills/trending?range=all' },
      { path: '/skills/tag/cloudflare', status: 200, bodyContains: ['<h1'] },
    ]))
  })

  it('checks rendered content on every page expected to return 200', () => {
    // A status-only check cannot tell a rendered page from an empty shell,
    // which is how a blank category surface shipped three times.
    const unchecked = PRODUCTION_SMOKE_EXPECTATIONS
      .filter(item => item.status === 200 && !item.bodyContains?.length)
      .map(item => item.path)

    // The asset-coherence page is exempt: its own pass already reads the body
    // and asserts the Nuxt asset manifest is non-empty.
    expect(unchecked).toEqual([ASSET_COHERENCE_PATH])
  })

  it('reports status and redirect mismatches as values', () => {
    expect(evaluateSmokeObservation(
      { path: '/skills/tag/plan', status: 301, location: '/skills/plan' },
      { status: 200, location: null },
    )).toEqual({
      _tag: 'failed',
      reason: 'status_mismatch',
      expected: '301',
      actual: '200',
    })

    expect(evaluateSmokeObservation(
      { path: '/skills/tag/plan', status: 301, location: '/skills/plan' },
      { status: 301, location: '/wrong' },
    )).toEqual({
      _tag: 'failed',
      reason: 'location_mismatch',
      expected: '/skills/plan',
      actual: '/wrong',
    })
  })

  it('fails a 200 that rendered no content', () => {
    // The regression this exists for: on 2026-08-12 every /skills/<category>
    // returned 200 with the data in the Nuxt payload but no <h1> and a fallback
    // <title>, because the page fetched without awaiting. Three deploys passed
    // a status-only smoke check with the whole category surface blank.
    const emptyShell = '<html><body><div id="__nuxt"></div>'
      + '<script>window.__NUXT__={"data":{"seoTitle":"Agent Skills for SEO"}}</script>'
      + '</body></html>'

    expect(evaluateSmokeObservation(
      { path: '/skills/seo', status: 200, bodyContains: ['<h1', 'Agent Skills for SEO'] },
      { status: 200, location: null, body: emptyShell },
    )).toEqual({
      _tag: 'failed',
      reason: 'content_missing',
      expected: '<h1',
      actual: 'absent from body',
    })

    expect(evaluateSmokeObservation(
      { path: '/skills/seo', status: 200, bodyContains: ['<h1', 'Agent Skills for SEO'] },
      { status: 200, location: null, body: '<h1>SEO</h1><title>Agent Skills for SEO · skilld</title>' },
    )).toEqual({ _tag: 'passed' })
  })

  it('treats an unread body as missing rather than passing by default', () => {
    // A body-less observation must not silently satisfy a content expectation,
    // or the check would pass everywhere it is not wired up.
    expect(evaluateSmokeObservation(
      { path: '/skills/seo', status: 200, bodyContains: ['<h1'] },
      { status: 200, location: null },
    )).toEqual({
      _tag: 'failed',
      reason: 'content_missing',
      expected: '<h1',
      actual: 'body not read',
    })
  })

  it('retries rollout mismatches and returns a complete successful report', async () => {
    const attempts = new Map<string, number>()
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      const count = (attempts.get(url.pathname) ?? 0) + 1
      attempts.set(url.pathname, count)
      if (url.pathname === '/_nuxt/v2/app.js')
        return new Response('', { status: 200 })
      const expectation = PRODUCTION_SMOKE_EXPECTATIONS.find(item => item.path === url.pathname)!
      if (url.pathname === '/skills' && count === 1)
        return new Response('', { status: 503 })
      // Every mocked page serves the fragments its expectation asks for, so
      // this test stays about retry behaviour rather than content.
      const body = [
        ...(expectation.bodyContains ?? []),
        ...(url.pathname === ASSET_COHERENCE_PATH ? ['<script src="/_nuxt/v2/app.js"></script>'] : []),
      ].join('')
      return new Response(
        body,
        {
          status: expectation.status,
          headers: {
            ...(expectation.location ? { location: expectation.location } : {}),
            ...(url.pathname === ASSET_COHERENCE_PATH ? { 'content-type': 'text/html' } : {}),
          },
        },
      )
    })

    const result = await runProductionSmoke({
      baseUrl: 'https://skilld.dev',
      attempts: 2,
      fetch,
      wait: vi.fn(async () => {}),
    })

    expect(result._tag).toBe('passed')
    expect(attempts.get('/skills')).toBe(2)
  })

  it('surfaces persistent network failures without throwing', async () => {
    const result = await runProductionSmoke({
      baseUrl: 'https://skilld.dev',
      attempts: 2,
      fetch: vi.fn(async () => Promise.reject(new Error('offline'))),
      wait: vi.fn(async () => {}),
      expectations: [{ path: '/', status: 200 }],
    })

    expect(result).toEqual({
      _tag: 'failed',
      failures: [{
        path: '/',
        attempts: 2,
        result: {
          _tag: 'failed',
          reason: 'network_error',
          expected: 'response',
          actual: 'offline',
        },
      }],
    })
  })

  it('fails when the checked page references an unavailable Nuxt asset', async () => {
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === ASSET_COHERENCE_PATH) {
        return new Response(
          '<html><head><link rel="modulepreload" href="/_nuxt/v2/missing.js"></head></html>',
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        )
      }
      return new Response('', { status: 404 })
    })

    const result = await runProductionSmoke({
      baseUrl: 'https://skilld.dev',
      attempts: 1,
      assetCoherenceAttempts: 1,
      fetch,
      expectations: [{ path: ASSET_COHERENCE_PATH, status: 200 }],
    })

    expect(result).toEqual({
      _tag: 'failed',
      failures: [{
        path: '/_nuxt/v2/missing.js',
        attempts: 1,
        result: {
          _tag: 'failed',
          reason: 'status_mismatch',
          expected: '200',
          actual: '404',
        },
      }],
    })
  })

  it('waits for every asset before requesting its cacheable URL', async () => {
    let delayedProbeAttempts = 0
    let delayedCleanUrlPoisoned = false
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === ASSET_COHERENCE_PATH) {
        return new Response(
          '<script src="/_nuxt/v2/ready.js"></script><link rel="modulepreload" href="/_nuxt/v2/delayed.js">',
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        )
      }
      if (url.pathname === '/_nuxt/v2/ready.js')
        return new Response('', { status: 200 })
      if (url.pathname === '/_nuxt/v2/delayed.js' && url.search) {
        delayedProbeAttempts++
        return new Response('', { status: delayedProbeAttempts >= 2 ? 200 : 404 })
      }
      if (url.pathname === '/_nuxt/v2/delayed.js') {
        if (delayedProbeAttempts < 2)
          delayedCleanUrlPoisoned = true
        return new Response('', { status: delayedCleanUrlPoisoned ? 404 : 200 })
      }
      return new Response('', { status: 404 })
    })

    const result = await runProductionSmoke({
      baseUrl: 'https://skilld.dev',
      attempts: 2,
      retryDelayMs: 0,
      fetch,
      wait: vi.fn(async () => {}),
      expectations: [{ path: ASSET_COHERENCE_PATH, status: 200 }],
    })

    expect(result._tag).toBe('passed')
    expect(delayedProbeAttempts).toBe(2)
    expect(delayedCleanUrlPoisoned).toBe(false)
  })

  it('bounds concurrent asset requests to preserve network capacity', async () => {
    let activeRequests = 0
    let peakRequests = 0
    const assets = Array.from(
      { length: 8 },
      (_, index) => `<script src="/_nuxt/v2/asset-${index}.js"></script>`,
    ).join('')
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === ASSET_COHERENCE_PATH) {
        return new Response(assets, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      }

      activeRequests++
      peakRequests = Math.max(peakRequests, activeRequests)
      if (activeRequests > 4) {
        activeRequests--
        throw new Error('socket capacity exceeded')
      }
      await new Promise(resolve => setTimeout(resolve, 1))
      activeRequests--
      return new Response('', { status: 200 })
    })

    const result = await runProductionSmoke({
      baseUrl: 'https://skilld.dev',
      attempts: 1,
      assetCoherenceAttempts: 1,
      fetch,
      expectations: [{ path: ASSET_COHERENCE_PATH, status: 200 }],
    })

    expect(result._tag).toBe('passed')
    expect(peakRequests).toBe(4)
  })

  it('keeps probing assets while a new version propagates past the page budget', async () => {
    // Assets are served by the per-version ASSETS binding, so during a rollout the
    // HTML can come from the new version while an asset request still lands on the
    // old one and 404s. That window has outlasted the page budget in production, so
    // asset coherence gets its own longer one.
    let round = 0
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === ASSET_COHERENCE_PATH) {
        round++
        return new Response(
          '<script src="/_nuxt/v2/propagating.js"></script>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      }
      if (url.pathname !== '/_nuxt/v2/propagating.js')
        return new Response('', { status: 404 })
      return new Response('', { status: round >= 20 ? 200 : 404 })
    })

    const result = await runProductionSmoke({
      baseUrl: 'https://skilld.dev',
      attempts: 12,
      retryDelayMs: 0,
      fetch,
      wait: vi.fn(async () => {}),
      expectations: [{ path: ASSET_COHERENCE_PATH, status: 200 }],
    })

    expect(result._tag).toBe('passed')
    expect(round).toBeGreaterThanOrEqual(20)
  })

  it('outwaits a CDN-cached 404 that predates the smoke', async () => {
    // `/_nuxt/v2/**` carries `cloudflare-cdn-cache-control: max-age=60`, so a 404
    // observed during rollout is pinned at the edge for the TTL. Origin is ready
    // (the cache-busted probe passes) and the clean URL only recovers once the
    // entry expires, so the retry cadence must outlast the TTL.
    const cdnCacheTtlMs = 60_000
    let elapsedMs = 0
    const cleanRequests: number[] = []
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === ASSET_COHERENCE_PATH) {
        return new Response(
          '<script src="/_nuxt/v2/pinned.js"></script>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      }
      if (url.pathname !== '/_nuxt/v2/pinned.js')
        return new Response('', { status: 404 })
      if (url.search)
        return new Response('', { status: 200 })
      cleanRequests.push(elapsedMs)
      return new Response('', { status: elapsedMs >= cdnCacheTtlMs ? 200 : 404 })
    })

    const result = await runProductionSmoke({
      baseUrl: 'https://skilld.dev',
      attempts: 12,
      retryDelayMs: 5_000,
      cdnCacheTtlMs,
      fetch,
      wait: vi.fn(async (milliseconds: number) => {
        elapsedMs += milliseconds
      }),
      expectations: [{ path: ASSET_COHERENCE_PATH, status: 200 }],
    })

    expect(result._tag).toBe('passed')
    expect(cleanRequests[0]).toBe(0)
    expect(cleanRequests.at(-1)).toBeGreaterThanOrEqual(cdnCacheTtlMs)
  })

  it('refetches the page when rollout HTML and assets are temporarily skewed', async () => {
    let pageRequests = 0
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === ASSET_COHERENCE_PATH) {
        pageRequests++
        return new Response(
          `<script src="/_nuxt/v2/${pageRequests === 1 ? 'stale' : 'ready'}.js"></script>`,
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        )
      }
      return new Response('', {
        status: url.pathname === '/_nuxt/v2/ready.js' ? 200 : 404,
      })
    })

    const result = await runProductionSmoke({
      baseUrl: 'https://skilld.dev',
      attempts: 2,
      retryDelayMs: 0,
      fetch,
      wait: vi.fn(async () => {}),
      expectations: [{ path: ASSET_COHERENCE_PATH, status: 200 }],
    })

    expect(result._tag).toBe('passed')
    expect(pageRequests).toBe(2)
  })
})
