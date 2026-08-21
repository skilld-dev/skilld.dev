// @vitest-environment node
import type { SendEmailInput, SendEmailResult } from '../../layers/identity/server/utils/email'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildXApiFailureEmail, notifyXApiFailure } from '../../server/utils/x-api-alert'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_296_800

describe('notifyXApiFailure', () => {
  let store: ReturnType<typeof createSqliteD1>
  let sent: SendEmailInput[]

  beforeEach(() => {
    store = createSqliteD1(['migrations/0113_x_api_alerts.sql'])
    sent = []
  })

  afterEach(() => store.close())

  function sender(result: SendEmailResult = { _tag: 'accepted', messageId: 'message-1' }) {
    return async (input: SendEmailInput): Promise<SendEmailResult> => {
      sent.push(input)
      return result
    }
  }

  it('emails the operator with the task and real failure cause', async () => {
    const result = await notifyXApiFailure({
      db: store.db,
      taskName: 'sync-x-mentions',
      error: { _tag: 'cap-exceeded' },
      now: NOW,
      to: 'operator@example.com',
      send: sender(),
    })

    expect(result).toEqual({ _tag: 'sent', messageId: 'message-1' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: 'operator@example.com',
      subject: '[skilld] X API failure: monthly X cap reached',
    })
    expect(sent[0]?.text).toContain('Task: sync-x-mentions')
    expect(sent[0]?.text).toContain('Cause: monthly X cap reached')
  })

  it('keeps an upstream response out of email headers and HTML', () => {
    const email = buildXApiFailureEmail({
      taskName: 'sync-x-mentions',
      error: { _tag: 'http-error', status: 503, body: 'down\nBcc: victim@example.com <script>' },
      now: NOW,
      to: 'operator@example.com',
    })

    expect(email.subject).not.toContain('\n')
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.html).not.toContain('<script>')
  })

  it('deduplicates the same cause across both X tasks for 24 hours', async () => {
    const send = sender()
    await notifyXApiFailure({
      db: store.db,
      taskName: 'sync-x-mentions',
      error: { _tag: 'cap-exceeded' },
      now: NOW,
      to: 'operator@example.com',
      send,
    })
    const result = await notifyXApiFailure({
      db: store.db,
      taskName: 'refresh-x-engagement',
      error: { _tag: 'cap-exceeded' },
      now: NOW + 60,
      to: 'operator@example.com',
      send,
    })

    expect(result).toEqual({ _tag: 'deduplicated' })
    expect(sent).toHaveLength(1)
  })

  it('alerts again when the cause changes', async () => {
    const send = sender()
    await notifyXApiFailure({
      db: store.db,
      taskName: 'sync-x-mentions',
      error: { _tag: 'cap-exceeded' },
      now: NOW,
      to: 'operator@example.com',
      send,
    })
    const result = await notifyXApiFailure({
      db: store.db,
      taskName: 'sync-x-mentions',
      error: { _tag: 'unauthorized' },
      now: NOW + 60,
      to: 'operator@example.com',
      send,
    })

    expect(result._tag).toBe('sent')
    expect(sent).toHaveLength(2)
  })

  it('retries delivery after the email provider rejects the alert', async () => {
    const rejected = await notifyXApiFailure({
      db: store.db,
      taskName: 'sync-x-mentions',
      error: { _tag: 'unauthorized' },
      now: NOW,
      to: 'operator@example.com',
      send: sender({ _tag: 'rejected', error: 'provider unavailable' }),
    })
    const retried = await notifyXApiFailure({
      db: store.db,
      taskName: 'refresh-x-engagement',
      error: { _tag: 'unauthorized' },
      now: NOW + 60,
      to: 'operator@example.com',
      send: sender(),
    })

    expect(rejected).toEqual({ _tag: 'send-failed', error: 'provider unavailable' })
    expect(retried._tag).toBe('sent')
    expect(sent).toHaveLength(2)
  })

  it('repeats an unresolved cause after 24 hours', async () => {
    const send = sender()
    await notifyXApiFailure({
      db: store.db,
      taskName: 'sync-x-mentions',
      error: { _tag: 'rate-limited', resetAt: null },
      now: NOW,
      to: 'operator@example.com',
      send,
    })
    const result = await notifyXApiFailure({
      db: store.db,
      taskName: 'sync-x-mentions',
      error: { _tag: 'rate-limited', resetAt: null },
      now: NOW + 24 * 60 * 60,
      to: 'operator@example.com',
      send,
    })

    expect(result._tag).toBe('sent')
    expect(sent).toHaveLength(2)
  })
})
