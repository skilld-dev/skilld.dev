import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from './email'

// `useEvent` is a Nitro server-only autoimport (nitropack/runtime/internal/context),
// which the `environment: 'nuxt'` test setup does NOT inject — unlike `useRuntimeConfig`
// (a Nuxt app-level composable). Stub it so sendEmail can reach the EMAIL binding.
const send = vi.fn()

vi.stubGlobal('useEvent', () => ({
  context: {
    platform: {
      env: {
        EMAIL: { send },
      },
    },
  },
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('sendEmail', () => {
  it('sends through the Cloudflare Email Service builder API', async () => {
    send.mockResolvedValue({ messageId: 'msg_1' })

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
    send.mockRejectedValue(new Error('sender not verified'))

    await expect(sendEmail({
      to: 'person@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
    })).resolves.toEqual({ ok: false, error: 'sender not verified' })
  })
})
