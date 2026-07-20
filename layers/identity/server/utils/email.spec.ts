import { describe, expect, it, vi } from 'vitest'
import { sendEmail } from './email'

describe('sendEmail', () => {
  it('sends through the Cloudflare Email Service builder API', async () => {
    const send = vi.fn(async () => ({ messageId: 'msg_1' }))

    const result = await sendEmail({
      to: 'person@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
      text: 'Hello',
      headers: { 'List-Unsubscribe': '<https://skilld.dev/unsubscribe>' },
    })

    expect(result).toEqual({ ok: true, messageId: 'msg_1' })
    expect(send).toHaveBeenCalledWith({
      to: 'person@example.com',
      from: { email: 'noreply@mail.skilld.dev', name: 'skilld' },
      subject: 'Welcome',
      html: '<p>Hello</p>',
      text: 'Hello',
      headers: { 'List-Unsubscribe': '<https://skilld.dev/unsubscribe>' },
    })
  })

  it('returns provider failures to the digest runner', async () => {
    const send = vi.fn(async () => {
      throw new Error('sender not verified')
    })

    await expect(sendEmail({
      to: 'person@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
    })).resolves.toEqual({ ok: false, error: 'sender not verified' })
  })
})
