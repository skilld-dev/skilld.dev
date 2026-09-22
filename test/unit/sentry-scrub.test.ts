import type { Breadcrumb, ErrorEvent } from '@sentry/nuxt'
import { describe, expect, it } from 'vitest'
import {
  parseSentryTunnelEnvelope,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  stripUrlQuery,
} from '../../shared/sentry'

const DSN = 'https://b275b367f8096d04db8c2ebcfadc3aba@o4510507748163584.ingest.us.sentry.io/4511781692506112'

describe('sentry URL scrub', () => {
  it('drops the query string and fragment', () => {
    expect(stripUrlQuery('https://skilld.dev/auth/github?code=abc&t=secret#done')).toBe('https://skilld.dev/auth/github')
    expect(stripUrlQuery('/api/unsubscribe?t=token')).toBe('/api/unsubscribe')
    expect(stripUrlQuery('/skills')).toBe('/skills')
  })
})

describe('sentry event scrub', () => {
  it('removes the user IP address, cookies, headers, bodies, and query strings', () => {
    const event: ErrorEvent = {
      type: undefined,
      transaction: '/auth/github?code=abc',
      user: { ip_address: '203.0.113.9' },
      request: {
        url: 'https://skilld.dev/auth/github?code=abc&t=secret',
        query_string: 'code=abc&t=secret',
        cookies: { session: 'x' },
        data: { email: 'a@example.com' },
        headers: { 'User-Agent': 'Firefox', 'Referer': 'https://skilld.dev/?q=me', 'X-Forwarded-For': '203.0.113.9' },
      },
      breadcrumbs: [
        { category: 'fetch', data: { url: '/api/me?token=abc', method: 'GET' } },
        { category: 'console', message: 'user typed secret' },
      ],
    }

    expect(scrubSentryEvent(event)).toEqual({
      type: undefined,
      transaction: '/auth/github',
      request: {
        url: 'https://skilld.dev/auth/github',
        headers: { 'User-Agent': 'Firefox' },
      },
      breadcrumbs: [
        { category: 'fetch', data: { url: '/api/me', method: 'GET' } },
      ],
    })
  })

  it('keeps a user id while removing the IP address', () => {
    const event: ErrorEvent = { type: undefined, user: { id: '42', ip_address: '{{auto}}' } }
    expect(scrubSentryEvent(event).user).toEqual({ id: '42' })
  })
})

describe('sentry breadcrumb scrub', () => {
  it('drops console and UI click breadcrumbs', () => {
    expect(scrubSentryBreadcrumb({ category: 'console', message: 'x' })).toBeNull()
    expect(scrubSentryBreadcrumb({ category: 'ui.click', message: 'button.copy' })).toBeNull()
  })

  it('strips queries from navigation breadcrumbs', () => {
    const breadcrumb: Breadcrumb = { category: 'navigation', data: { from: '/login?next=/me', to: '/me#tab' } }
    expect(scrubSentryBreadcrumb(breadcrumb)).toEqual({ category: 'navigation', data: { from: '/login', to: '/me' } })
  })
})

describe('sentry tunnel envelope', () => {
  const envelope = (dsn: string) => `${JSON.stringify({ dsn, sent_at: '2026-09-16T00:00:00Z' })}\n{"type":"event"}\n{}`

  it('forwards an envelope for the configured project to its ingest host', () => {
    expect(parseSentryTunnelEnvelope(envelope(DSN), DSN)).toEqual({
      _tag: 'forward',
      url: 'https://o4510507748163584.ingest.us.sentry.io/api/4511781692506112/envelope/',
    })
  })

  it('rejects another host or project', () => {
    expect(parseSentryTunnelEnvelope(envelope('https://key@evil.example/4511781692506112'), DSN))
      .toEqual({ _tag: 'reject', reason: 'wrong-dsn' })
    expect(parseSentryTunnelEnvelope(envelope('https://key@o4510507748163584.ingest.us.sentry.io/1'), DSN))
      .toEqual({ _tag: 'reject', reason: 'wrong-dsn' })
  })

  it('rejects an envelope without a readable DSN header', () => {
    expect(parseSentryTunnelEnvelope('', DSN)).toEqual({ _tag: 'reject', reason: 'empty' })
    expect(parseSentryTunnelEnvelope('not json\n{}', DSN)).toEqual({ _tag: 'reject', reason: 'bad-header' })
    expect(parseSentryTunnelEnvelope('{"event_id":"1"}\n{}', DSN)).toEqual({ _tag: 'reject', reason: 'bad-header' })
  })
})
