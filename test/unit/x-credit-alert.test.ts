import type { SendEmailInput, SendEmailResult } from '../../layers/identity/server/utils/email'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { notifyXCreditDepletion } from '../../server/utils/x-credit-alert'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_801_264_400

describe('notifyXCreditDepletion', () => {
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

  it('emails the admin once when either X task runs out of credits', async () => {
    const send = sender()
    const first = await notifyXCreditDepletion({ db: store.db, taskName: 'sync-x-mentions', now: NOW, send })
    const second = await notifyXCreditDepletion({ db: store.db, taskName: 'refresh-x-engagement', now: NOW + 60, send })

    expect(first).toEqual({ _tag: 'sent', messageId: 'message-1' })
    expect(second).toEqual({ _tag: 'deduplicated' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: 'harlan@harlanzw.com',
      subject: '[skilld] X API credits depleted',
    })
    expect(sent[0]?.text).toContain('sync-x-mentions')
    expect(sent[0]?.text).toContain('https://console.x.com/')
  })

  it('retries after email delivery is rejected', async () => {
    const rejected = await notifyXCreditDepletion({
      db: store.db,
      taskName: 'sync-x-mentions',
      now: NOW,
      send: sender({ _tag: 'rejected', error: 'provider unavailable' }),
    })
    const retried = await notifyXCreditDepletion({
      db: store.db,
      taskName: 'refresh-x-engagement',
      now: NOW + 60,
      send: sender(),
    })

    expect(rejected).toEqual({ _tag: 'send-failed', error: 'provider unavailable' })
    expect(retried).toEqual({ _tag: 'sent', messageId: 'message-1' })
  })

  it('reminds the admin after 24 hours if credits stay depleted', async () => {
    const send = sender()
    await notifyXCreditDepletion({ db: store.db, taskName: 'sync-x-mentions', now: NOW, send })
    const again = await notifyXCreditDepletion({
      db: store.db,
      taskName: 'sync-x-mentions',
      now: NOW + 24 * 60 * 60,
      send,
    })

    expect(again._tag).toBe('sent')
    expect(sent).toHaveLength(2)
  })
})
