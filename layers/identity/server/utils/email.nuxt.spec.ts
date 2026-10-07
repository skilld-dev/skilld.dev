import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendEmail, sendEmailWithEnv } from './email'

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

    expect(result).toEqual({
      _tag: 'accepted',
      messageId: 'msg_1',
    })
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
    })).resolves.toEqual({
      _tag: 'rejected',
      error: 'sender not verified',
    })
  })

  it('accepts explicit task dependencies', async () => {
    send.mockResolvedValue({ messageId: 'msg_task' })

    await expect(sendEmailWithEnv({ EMAIL: { send } } as unknown as Pick<Cloudflare.Env, 'EMAIL'>, {
      to: 'ops@example.com',
      from: { email: 'noreply@mail.skilld.dev', name: 'skilld' },
      subject: 'Health',
      html: '<p>Healthy</p>',
      text: 'Healthy',
    })).resolves.toEqual({
      _tag: 'accepted',
      messageId: 'msg_task',
    })
  })

  it.each([
    [{}, 'missing'],
    [{ messageId: '' }, 'empty'],
    [{ messageId: 42 }, 'non-string'],
  ])('returns uncertain for malformed provider success: %s', async (providerResult) => {
    send.mockResolvedValue(providerResult)

    await expect(sendEmail({
      to: 'person@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
    })).resolves.toEqual({
      _tag: 'uncertain',
      error: 'Email provider returned success without a nonempty message ID',
    })
  })

  it('returns rejected when the email binding is missing', async () => {
    await expect(sendEmailWithEnv(undefined, {
      to: 'person@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
    })).resolves.toMatchObject({
      _tag: 'rejected',
      error: 'EMAIL binding missing (configure send_email in wrangler)',
    })
  })
})
