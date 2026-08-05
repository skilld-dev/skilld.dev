import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('sentry release wiring', () => {
  // SKILLD-F cost several extra reads because its events carried no release, so
  // "which version served this" could not be answered from the event itself.
  it('passes a release to the server SDK, normalising empty to undefined', () => {
    const source = readFileSync(join(process.cwd(), 'server/plugins/sentry.ts'), 'utf8')
    expect(source).toContain('release: sentry.release || undefined')
  })

  it('pins the same release for the bundler plugin and the runtime', () => {
    const source = readFileSync(join(process.cwd(), 'nuxt.config.ts'), 'utf8')
    expect(source).toContain('release: sentryRelease() ?? \'\'')
    expect(source).toContain('release: { name: sentryRelease() }')
  })

  it('leaves the client release to the bundler plugin', () => {
    const source = readFileSync(join(process.cwd(), 'sentry.client.config.ts'), 'utf8')
    expect(source).not.toContain('release:')
  })
})
