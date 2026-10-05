import type { EventHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsCountry, analyticsIndex, copyDataPoint } from '../../shared/analytics'

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

  it('cuts an index that would breach the 96-byte Analytics Engine limit', () => {
    const long = `${'a'.repeat(120)}/skill`
    expect(analyticsIndex(long)).toHaveLength(32)
    expect(analyticsIndex('')).toBe('unknown')
  })

  // The cut keeps 32 UTF-16 code units, which encode to at most 96 UTF-8
  // bytes: 3 bytes per BMP unit, 4 per surrogate pair. An astral slug of 40
  // emoji therefore lands at 16 emoji, well under the cap.
  it('keeps a 40-emoji slug under the cap instead of rejecting the data point', () => {
    const point = copyDataPoint({
      surface: 'skill-card',
      mode: 'run',
      kind: 'skill',
      slug: '🎉'.repeat(40),
      country: 'AU',
    })
    const [index] = point.indexes
    expect(new TextEncoder().encode(index!).length).toBeLessThanOrEqual(96)
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
          env: {
            // Analytics Engine rejects an index over 96 bytes, taking the whole
            // data point with it, so the stub mirrors that contract.
            SKILLD_WEB_ANALYTICS: {
              writeDataPoint: (point: { indexes: string[] }) => {
                for (const index of point.indexes) {
                  if (new TextEncoder().encode(index).length > 96)
                    throw new Error('index exceeds the 96-byte Analytics Engine cap')
                }
                written.push(point)
              },
            },
          },
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

  it('answers ok when an astral-character slug must be cut to the index cap', async () => {
    await expect(loadHandler(
      {},
      { surface: 'skill-card', kind: 'skill', owner: '🎉', name: '🎉'.repeat(31), mode: 'run' },
    )).resolves.toEqual({ ok: true })
  })
})
