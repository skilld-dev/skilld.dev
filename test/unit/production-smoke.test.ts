import type { SmokeFetch } from '../../scripts/lib/production-smoke'
import { describe, expect, it, vi } from 'vitest'
import {
  evaluateSmokeObservation,
  PRODUCTION_SMOKE_EXPECTATIONS,
  runProductionSmoke,
} from '../../scripts/lib/production-smoke'

describe('production smoke contract', () => {
  it('covers the public routes implicated by the closed incidents', () => {
    expect(PRODUCTION_SMOKE_EXPECTATIONS).toEqual(expect.arrayContaining([
      { path: '/', status: 200 },
      { path: '/skills', status: 200 },
      { path: '/community', status: 200 },
      { path: '/collections', status: 301, location: '/community' },
      { path: '/guides', status: 410 },
      { path: '/guides/npm/example', status: 410 },
      { path: '/skills/leaderboard', status: 200 },
      { path: '/skills/not-a-real-outcome', status: 404 },
      { path: '/collections/_CollectionAvatar', status: 404 },
      { path: '/skills/tag/plan', status: 301, location: '/skills/plan' },
      { path: '/skills/tag/cloudflare', status: 200 },
    ]))
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
      return new Response(
        url.pathname === '/skills/leaderboard'
          ? '<script src="/_nuxt/v2/app.js"></script>'
          : '',
        {
          status: expectation.status,
          headers: {
            ...(expectation.location ? { location: expectation.location } : {}),
            ...(url.pathname === '/skills/leaderboard' ? { 'content-type': 'text/html' } : {}),
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

  it('fails when the leaderboard references an unavailable Nuxt asset', async () => {
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/skills/leaderboard') {
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
      expectations: [{ path: '/skills/leaderboard', status: 200 }],
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
      if (url.pathname === '/skills/leaderboard') {
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
      expectations: [{ path: '/skills/leaderboard', status: 200 }],
    })

    expect(result._tag).toBe('passed')
    expect(delayedProbeAttempts).toBe(2)
    expect(delayedCleanUrlPoisoned).toBe(false)
  })

  it('keeps probing assets while a new version propagates past the page budget', async () => {
    // Assets are served by the per-version ASSETS binding, so during a rollout the
    // HTML can come from the new version while an asset request still lands on the
    // old one and 404s. That window has outlasted the page budget in production, so
    // asset coherence gets its own longer one.
    let round = 0
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/skills/leaderboard') {
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
      expectations: [{ path: '/skills/leaderboard', status: 200 }],
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
      if (url.pathname === '/skills/leaderboard') {
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
      expectations: [{ path: '/skills/leaderboard', status: 200 }],
    })

    expect(result._tag).toBe('passed')
    expect(cleanRequests[0]).toBe(0)
    expect(cleanRequests.at(-1)).toBeGreaterThanOrEqual(cdnCacheTtlMs)
  })

  it('refetches the page when rollout HTML and assets are temporarily skewed', async () => {
    let pageRequests = 0
    const fetch: SmokeFetch = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/skills/leaderboard') {
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
      expectations: [{ path: '/skills/leaderboard', status: 200 }],
    })

    expect(result._tag).toBe('passed')
    expect(pageRequests).toBe(2)
  })
})
