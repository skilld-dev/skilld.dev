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
      { path: '/collections', status: 200 },
      { path: '/guides', status: 200 },
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
      const expectation = PRODUCTION_SMOKE_EXPECTATIONS.find(item => item.path === url.pathname)!
      if (url.pathname === '/skills' && count === 1)
        return new Response('', { status: 503 })
      return new Response('', {
        status: expectation.status,
        headers: expectation.location ? { location: expectation.location } : undefined,
      })
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
})
