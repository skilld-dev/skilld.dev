import type { EventHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsCountry, analyticsIndex, cliDataPoint, copyDataPoint } from '../../shared/analytics'

describe('anonymous analytics data points', () => {
  it('writes a copy as surface, mode, kind, slug, and country', () => {
    expect(copyDataPoint({
      surface: 'skill-card',
      mode: 'run',
      kind: 'skill',
      slug: 'antfu/vite',
      country: 'AU',
    })).toEqual({
      blobs: ['skill-card', 'run', 'skill', 'antfu/vite', 'AU'],
      doubles: [1],
      indexes: ['antfu/vite'],
    })
  })

  it('keeps no account id on a CLI run from a signed-in person', () => {
    const point = cliDataPoint({
      event: 'run',
      surface: 'cli:run',
      sourceKind: 'gh',
      slug: 'obra/superpowers',
      cliVersion: '3.1.0',
      agent: 'claude-code',
      country: 'US',
      durationMs: 420,
    })

    expect(point.blobs).toEqual(['run', 'cli:run', 'gh', 'obra/superpowers', '3.1.0', 'claude-code', 'US'])
    expect(point.doubles).toEqual([1, 420])
    expect(point.indexes).toEqual(['obra/superpowers'])
  })

  it('cuts an index that would breach the 96-byte Analytics Engine limit', () => {
    const long = `${'a'.repeat(120)}/skill`
    expect(analyticsIndex(long)).toHaveLength(32)
    expect(analyticsIndex('')).toBe('unknown')
  })

  it('accepts only a two-letter country from the request header', () => {
    expect(analyticsCountry('AU')).toBe('AU')
    expect(analyticsCountry(undefined)).toBe('XX')
    expect(analyticsCountry('203.0.113.9')).toBe('XX')
    expect(analyticsCountry('aus')).toBe('XX')
  })
})

describe('copy event endpoint', () => {
  const written: unknown[] = []

  async function loadHandler(headers: Record<string, string>, body: unknown) {
    written.length = 0
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    vi.stubGlobal('createError', (input: { statusCode: number }) => Object.assign(new Error('rejected'), input))
    vi.stubGlobal('readBody', async () => body)
    vi.stubGlobal('getUserSession', async () => null)
    vi.stubGlobal('getHeader', (_event: unknown, name: string) => headers[name])
    vi.resetModules()
    const handler = (await import('../../server/api/events/install.post')).default as unknown as (event: unknown) => Promise<unknown>
    return handler({
      method: 'POST',
      node: { req: { headers } },
      context: {
        platform: {
          env: { SKILLD_WEB_ANALYTICS: { writeDataPoint: (point: unknown) => written.push(point) } },
        },
      },
    })
  }

  beforeEach(() => {
    written.length = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('records a collection copy as handle/slug and drops the visitor IP address', async () => {
    await expect(loadHandler(
      { 'cf-ipcountry': 'DE', 'cf-connecting-ip': '203.0.113.9' },
      { surface: 'collection-page', kind: 'collection', handle: 'harlan-zw', slug: 'design-engineering-essentials', mode: 'install' },
    )).resolves.toEqual({ ok: true })

    expect(written).toEqual([{
      blobs: ['collection-page', 'install', 'collection', 'harlan-zw/design-engineering-essentials', 'DE'],
      doubles: [1],
      indexes: ['harlan-zw/design-engineering-essentials'],
    }])
  })

  it('refuses a body that names a person', async () => {
    await expect(loadHandler(
      {},
      { surface: 'skill-card', kind: 'skill', owner: 'antfu', name: 'vite', mode: 'run', userId: 12 },
    )).rejects.toMatchObject({ statusCode: 400 })
    expect(written).toEqual([])
  })
})
