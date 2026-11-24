import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBestEffortCacheWriteError, isClosedBroadcastChannelError, isMcpAcceptProbeError } from '../../shared/sentry'
import { dependencyOutageError, isDependencyOutageError } from '../../shared/server/dependency-outage'

describe('isClosedBroadcastChannelError', () => {
  const closed = 'Failed to execute \'postMessage\' on \'BroadcastChannel\': Channel is closed'

  it('matches the SKILLD-12 closed-channel postMessage the multi-tab plugin throws', () => {
    expect(isClosedBroadcastChannelError(new DOMException(closed, 'InvalidStateError'))).toBe(true)
  })

  it('matches the Sentry-serialized exception, whose message arrives as value', () => {
    expect(isClosedBroadcastChannelError({
      type: 'InvalidStateError',
      value: closed,
      mechanism: { handled: false, type: 'auto.browser.global_handlers.onunhandledrejection' },
    })).toBe(true)
  })

  it('ignores postMessage failures on other targets, which are not the tab-close race', () => {
    expect(isClosedBroadcastChannelError(
      new DOMException('Failed to execute \'postMessage\' on \'Worker\': Channel is closed', 'InvalidStateError'),
    )).toBe(false)
    expect(isClosedBroadcastChannelError(
      new DOMException('Failed to execute \'postMessage\' on \'BroadcastChannel\': An object could not be cloned.', 'DataCloneError'),
    )).toBe(false)
  })

  it('ignores generic invalid-state errors and values that are not errors', () => {
    expect(isClosedBroadcastChannelError(new DOMException('The object is in an invalid state.', 'InvalidStateError'))).toBe(false)
    expect(isClosedBroadcastChannelError(closed)).toBe(false)
    expect(isClosedBroadcastChannelError(undefined)).toBe(false)
  })
})

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

describe('isDependencyOutageError', () => {
  it('matches the 503 a handler raises for a dependency outage it already recorded', () => {
    expect(isDependencyOutageError(dependencyOutageError({ dependency: 'raw.githubusercontent.com', message: 'Package details are unavailable. Try again later.' }))).toBe(true)
    expect(isDependencyOutageError(dependencyOutageError({ dependency: 'search lanes', statusMessage: 'Search is temporarily unavailable.' }))).toBe(true)
  })

  it('answers 503 and keeps the message the client reads', () => {
    expect(dependencyOutageError({ dependency: 'raw.githubusercontent.com', message: 'Asset source is unavailable upstream' }))
      .toMatchObject({ statusCode: 503, message: 'Asset source is unavailable upstream' })
  })

  it('ignores a 503 without the mark, whatever its message says', () => {
    expect(isDependencyOutageError(createError({ statusCode: 503, message: 'Asset source is unavailable upstream' }))).toBe(false)
    expect(isDependencyOutageError(createError({ statusCode: 503, message: 'Check-in bindings or deployment identity are missing.' }))).toBe(false)
  })

  it('ignores values that are not errors', () => {
    expect(isDependencyOutageError({ type: 'Error', value: 'Package details are unavailable. Try again later.' })).toBe(false)
    expect(isDependencyOutageError(undefined)).toBe(false)
  })
})

describe('isMcpAcceptProbeError', () => {
  it('matches the SKILLD-35 Accept-less GET probe the transport rejects', () => {
    expect(isMcpAcceptProbeError(new Error('Not Acceptable: Client must accept text/event-stream'))).toBe(true)
  })

  it('matches the POST probe that misses one of the two accepted types', () => {
    expect(isMcpAcceptProbeError(new Error('Not Acceptable: Client must accept both application/json and text/event-stream'))).toBe(true)
  })

  it('matches the Sentry-serialized exception, whose message arrives as value', () => {
    expect(isMcpAcceptProbeError({
      type: 'Error',
      value: 'Not Acceptable: Client must accept text/event-stream',
      mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
    })).toBe(true)
  })

  it('ignores the page 406, whose message names the page content types instead', () => {
    expect(isMcpAcceptProbeError(new Error('Supported types: text/html, text/markdown, text/plain'))).toBe(false)
  })

  it('ignores unrelated errors and values that are not errors', () => {
    expect(isMcpAcceptProbeError(new Error('KV PUT failed: 429 Too Many Requests'))).toBe(false)
    expect(isMcpAcceptProbeError('Not Acceptable: Client must accept text/event-stream')).toBe(false)
    expect(isMcpAcceptProbeError(undefined)).toBe(false)
  })
})

const { sentryCloudflareNitroPlugin } = vi.hoisted(() => ({
  sentryCloudflareNitroPlugin: vi.fn(),
}))

vi.mock('../../server/utils/sentry-cloudflare', () => ({ sentryCloudflareNitroPlugin }))
vi.mock('nuxt/server', () => ({ useRuntimeConfig: () => useNuxtApp().$config }))

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

  it.each([
    { issue: 'SKILLD-44', dependency: 'raw.githubusercontent.com', message: 'Package details are unavailable. Try again later.' },
    { issue: 'SKILLD-11', dependency: 'raw.githubusercontent.com', message: 'Asset source is unavailable upstream' },
  ])('drops the dependency outage 503 a handler already recorded ($issue)', ({ dependency, message }) => {
    const event: SentryEventFixture = { exception: { values: [{ type: 'Error', value: message }] } }
    expect(beforeSend(event, { originalException: dependencyOutageError({ dependency, message }) })).toBeNull()
  })

  it('keeps a 503 that carries no outage mark, such as missing deployment bindings', () => {
    const message = 'Check-in bindings or deployment identity are missing.'
    const event: SentryEventFixture = { exception: { values: [{ type: 'Error', value: message }] } }
    expect(beforeSend(event, { originalException: createError({ statusCode: 503, message }) })).toBe(event)
  })

  it('drops the intended MCP 406 the transport already answered to the probe', () => {
    const event: SentryEventFixture = {
      exception: { values: [{ type: 'Error', value: 'Not Acceptable: Client must accept text/event-stream' }] },
    }
    expect(beforeSend(event, { originalException: new Error('Not Acceptable: Client must accept text/event-stream') }))
      .toBeNull()
  })

  it('drops the MCP probe on the serialized exception alone, when the original error is absent', () => {
    const event: SentryEventFixture = {
      exception: { values: [{ type: 'Error', value: 'Not Acceptable: Client must accept text/event-stream' }] },
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
    const page406Event: SentryEventFixture = {
      exception: { values: [{ type: 'Error', value: 'Supported types: text/html, text/markdown, text/plain' }] },
    }
    expect(beforeSend(page406Event, {})).toBe(page406Event)
  })

  it.each([true, false])('drops rejected MCP protocol probes with original exception: %s', (original) => {
    const message = 'Bad Request: Unsupported protocol version: 2026-07-28 (supported versions: 2025-11-25, 2025-06-18)'
    const event: SentryEventFixture = { exception: { values: [{ type: 'Error', value: message }] } }
    expect(beforeSend(event, original ? { originalException: new Error(message) } : {})).toBeNull()
  })

  it('keeps other protocol errors', () => {
    const event: SentryEventFixture = { exception: { values: [{ type: 'Error', value: 'Unsupported protocol version in database connection' }] } }
    expect(beforeSend(event, {})).toBe(event)
  })
})
