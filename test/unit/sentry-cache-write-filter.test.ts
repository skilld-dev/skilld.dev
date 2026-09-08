import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBestEffortCacheWriteError, isExpectedUpstreamOutageError } from '../../shared/sentry'

describe('isBestEffortCacheWriteError', () => {
  it('matches the SKILLD-17 rate-limited KV write signature', () => {
    expect(isBestEffortCacheWriteError(new Error('KV PUT failed: 429 Too Many Requests'))).toBe(true)
  })

  it('matches the Sentry-serialized exception, whose message arrives as value', () => {
    expect(isBestEffortCacheWriteError({
      type: 'Error',
      value: 'KV PUT failed: 429 Too Many Requests',
      mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
    })).toBe(true)
  })

  it('ignores KV read failures, which are a different failure class', () => {
    expect(isBestEffortCacheWriteError(new Error('KV GET failed: 500 Internal Server Error'))).toBe(false)
  })

  it('ignores unrelated errors and values that are not errors', () => {
    expect(isBestEffortCacheWriteError(new Error('D1_ERROR: D1 DB is overloaded.'))).toBe(false)
    expect(isBestEffortCacheWriteError('KV PUT failed: 429 Too Many Requests')).toBe(false)
    expect(isBestEffortCacheWriteError(undefined)).toBe(false)
  })
})

describe('isExpectedUpstreamOutageError', () => {
  it('matches the three upstream-outage 503 signatures the handlers throw', () => {
    expect(isExpectedUpstreamOutageError(new Error('Skill source is unavailable upstream'))).toBe(true)
    expect(isExpectedUpstreamOutageError(new Error('SKILL.md source is unavailable upstream'))).toBe(true)
    expect(isExpectedUpstreamOutageError(new Error('Asset source is unavailable upstream'))).toBe(true)
  })

  it('matches the Sentry-serialized exception, whose message arrives as value', () => {
    expect(isExpectedUpstreamOutageError({
      type: 'Error',
      value: 'SKILL.md source is unavailable upstream',
      mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
    })).toBe(true)
  })

  it('ignores the gone-source 410, a permanent verdict rather than an outage', () => {
    expect(isExpectedUpstreamOutageError(new Error('Skill source is gone upstream'))).toBe(false)
  })

  it('ignores unrelated errors and values that are not errors', () => {
    expect(isExpectedUpstreamOutageError(new Error('KV PUT failed: 429 Too Many Requests'))).toBe(false)
    expect(isExpectedUpstreamOutageError('Skill source is unavailable upstream')).toBe(false)
    expect(isExpectedUpstreamOutageError(undefined)).toBe(false)
  })
})

const { sentryCloudflareNitroPlugin } = vi.hoisted(() => ({
  sentryCloudflareNitroPlugin: vi.fn(),
}))

vi.mock('@sentry/nuxt/module/plugins', () => ({ sentryCloudflareNitroPlugin }))

interface SentryEventFixture {
  exception?: { values?: Array<{ type?: string, value?: string }> }
}

describe('sentry beforeSend cache-write filter', () => {
  let beforeSend: (event: SentryEventFixture, hint: { originalException?: unknown }) => unknown

  beforeEach(async () => {
    vi.stubGlobal('defineNitroPlugin', (plugin: (nitroApp: unknown) => void) => plugin)
    sentryCloudflareNitroPlugin.mockClear()
    sentryCloudflareNitroPlugin.mockReturnValue(vi.fn())
    const config = (useNuxtApp().$config as { sentry: Record<string, unknown> }).sentry
    config.enabled = true
    config.dsn = 'https://examplePublicKey@o0.ingest.sentry.io/0'
    const registerPlugin = (await import('../../server/plugins/sentry')).default as
      (nitroApp: unknown) => void
    registerPlugin({})
    beforeSend = sentryCloudflareNitroPlugin.mock.calls[0]![0].beforeSend
  })

  it('drops the route-cache KV write failure Nitro already caught', () => {
    const event: SentryEventFixture = {
      exception: { values: [{ type: 'Error', value: 'KV PUT failed: 429 Too Many Requests' }] },
    }
    expect(beforeSend(event, { originalException: new Error('KV PUT failed: 429 Too Many Requests') }))
      .toBeNull()
  })

  it('drops on the serialized exception alone, when the original error is absent', () => {
    const event: SentryEventFixture = {
      exception: { values: [{ type: 'Error', value: 'KV PUT failed: 429 Too Many Requests' }] },
    }
    expect(beforeSend(event, {})).toBeNull()
  })

  it('drops the intended upstream-outage 503 the handler already reported as a wide event', () => {
    const event: SentryEventFixture = {
      exception: { values: [{ type: 'Error', value: 'Skill source is unavailable upstream' }] },
    }
    expect(beforeSend(event, { originalException: new Error('Skill source is unavailable upstream') }))
      .toBeNull()
  })

  it('drops the outage on the serialized exception alone, when the original error is absent', () => {
    const event: SentryEventFixture = {
      exception: { values: [{ type: 'Error', value: 'Asset source is unavailable upstream' }] },
    }
    expect(beforeSend(event, {})).toBeNull()
  })

  it('keeps every other event', () => {
    const event: SentryEventFixture = {
      exception: { values: [{ type: 'Error', value: 'D1_ERROR: D1 DB is overloaded.' }] },
    }
    expect(beforeSend(event, { originalException: new Error('D1_ERROR: D1 DB is overloaded.') }))
      .toBe(event)
    const goneEvent: SentryEventFixture = {
      exception: { values: [{ type: 'Error', value: 'Skill source is gone upstream' }] },
    }
    expect(beforeSend(goneEvent, {})).toBe(goneEvent)
  })
})
