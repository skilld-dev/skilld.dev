import { describe, expect, it } from 'vitest'
import { DemoEngagementInput } from '../../server/schemas/demo-engagement'
import { demoElapsedBucket, demoEngagementDataPoint, demoFrameIsVisible } from '../../shared/demo-engagement'

describe('anonymous demo engagement', () => {
  const base = { surface: 'home-hero-demo', slug: 'heyimjames/skills/good-css', campaign: 'direct' as const }
  it('keeps demo counts separate from existing command copy counts', () => {
    expect(demoEngagementDataPoint({ ...base, event: 'copy', format: 'agent', elapsed: '10-29s' }, 'AU')).toEqual({
      blobs: ['home-hero-demo', '', 'demo', base.slug, 'AU', 'copy', 'agent', '10-29s', 'direct'],
      doubles: [0, 1],
      indexes: [base.slug],
    })
  })
  it('rejects identity, prompt text, arbitrary campaigns, and invalid copy formats', () => {
    const point = { ...base, event: 'exposure' }
    expect(DemoEngagementInput.safeParse(point).success).toBe(true)
    for (const extra of [{ userId: '12' }, { prompt: 'private task' }, { campaign: 'private-user' }, { format: 'agent' }])
      expect(DemoEngagementInput.safeParse({ ...point, ...extra }).success).toBe(false)
    expect(DemoEngagementInput.safeParse({ ...base, event: 'copy', format: 'unknown', elapsed: 'under-10s' }).success).toBe(false)
    expect(DemoEngagementInput.safeParse({ ...point, slug: '' }).success).toBe(false)
  })
  it('stores only coarse time buckets, including actions before exposure', () => {
    expect([null, 0, 9999, 10000, 30000, 120000].map(demoElapsedBucket)).toEqual(['unseen', 'under-10s', 'under-10s', '10-29s', '30-119s', '120s-plus'])
  })
})

describe('demo exposure boundary', () => {
  it('requires half the frame in view before counting an exposure', () => {
    expect(demoFrameIsVisible({ isIntersecting: true, intersectionRatio: 0.1 })).toBe(false)
    expect(demoFrameIsVisible({ isIntersecting: true, intersectionRatio: 0.5 })).toBe(true)
    expect(demoFrameIsVisible({ isIntersecting: false, intersectionRatio: 1 })).toBe(false)
    expect(demoFrameIsVisible(undefined)).toBe(false)
  })
})
