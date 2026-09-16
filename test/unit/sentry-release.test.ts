import { afterEach, describe, expect, it } from 'vitest'
import { sentryRelease } from '../../shared/sentry'

const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
})

describe('sentryRelease', () => {
  it('reports the CI commit', () => {
    delete process.env.SENTRY_RELEASE
    process.env.GITHUB_SHA = 'fda2756d3fea4cf1278f71b72a76f73e978ad5b5'
    expect(sentryRelease()).toBe('fda2756d3fea4cf1278f71b72a76f73e978ad5b5')
  })

  it('lets an explicit release override the commit', () => {
    process.env.SENTRY_RELEASE = 'manual-build'
    process.env.GITHUB_SHA = 'fda2756'
    expect(sentryRelease()).toBe('manual-build')
  })

  it('is undefined rather than empty when no commit is available', () => {
    delete process.env.SENTRY_RELEASE
    delete process.env.GITHUB_SHA
    expect(sentryRelease()).toBeUndefined()
  })
})
