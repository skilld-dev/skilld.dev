import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planAccountSettings, updateAccountSettings } from '../../layers/identity/server/utils/account-settings'
import { sendEmailWithEnv, signUnsubToken, verifyUnsubToken } from '../../layers/identity/server/utils/email'
import { applyUnsubscribe, renderUnsubscribePage } from '../../layers/identity/server/utils/unsubscribe'
import { sendWelcomeEmail } from '../../layers/identity/server/utils/welcome-email'
import { identityEmailPatchBodySchema } from '../../layers/identity/shared/contracts/account'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

describe('one optional welcome email', () => {
  let d1: SqliteD1
  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec(`INSERT INTO users (id, github_id, login, email, created_at, last_login_at)
      VALUES (900001, 900001, 'new-account', 'account@example.com', 1, 1)`)
  })
  afterEach(() => d1.close())

  function input(consent = true, now = 10, attemptId = 'first') {
    return {
      db: d1.db,
      userId: 900001,
      to: 'account@example.com',
      consent,
      now,
      attemptId,
      signUnsubscribe: async () => 'signed-token',
      send: vi.fn().mockResolvedValue({ _tag: 'accepted', messageId: 'receipt' }),
    }
  }

  it('routes welcome replies to Harlan through the email binding', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'receipt' })
    const deps = input()
    deps.send.mockImplementation(message => sendEmailWithEnv(
      { EMAIL: { send } } as unknown as Pick<Cloudflare.Env, 'EMAIL'>,
      { ...message, from: { email: 'noreply@mail.skilld.dev', name: 'skilld' } },
    ))
    expect(await sendWelcomeEmail(deps)).toBe('accepted')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      replyTo: 'harlan@harlanzw.com',
    }))
  })

  it('requires an address when only the welcome email is selected', () => {
    expect(identityEmailPatchBodySchema.safeParse({ welcome_email: true }).success).toBe(false)
  })

  it('requires explicit recurring choices and preserves a welcome-only opt-in', async () => {
    expect(identityEmailPatchBodySchema.safeParse({ digest_email: 'account@example.com', welcome_email: true }).success).toBe(false)
    const body = identityEmailPatchBodySchema.parse({ digest_email: 'account@example.com', welcome_email: true, weekly_opt_in: false, email_opt_in: false })
    const plan = planAccountSettings({ email: 'account@example.com', digest_email: null }, {
      email: body.digest_email,
      weekly: body.weekly_opt_in,
      digest: body.email_opt_in,
    })
    if (plan._tag !== 'Ok')
      throw new Error('Expected valid email choices')
    await updateAccountSettings(d1.db, 900001, plan.columns)
    expect(d1.raw.prepare('SELECT email_opt_in, weekly_opt_out FROM users WHERE id = 900001').get())
      .toMatchObject({ email_opt_in: 0, weekly_opt_out: 1 })
  })

  it('binds the welcome unsubscribe token to its own list', async () => {
    const welcome = await signUnsubToken(900001, 'test-secret', 'welcome')
    const recurring = await signUnsubToken(900001, 'test-secret')
    expect(await verifyUnsubToken(welcome, 'test-secret', 'welcome')).toBe(900001)
    expect(await verifyUnsubToken(welcome, 'test-secret')).toBeNull()
    expect(await verifyUnsubToken(recurring, 'test-secret', 'welcome')).toBeNull()
    expect(await verifyUnsubToken(recurring, 'test-secret')).toBe(900001)
  })

  it('records a thrown send as uncertain and prevents another dispatch', async () => {
    const deps = input()
    deps.send.mockRejectedValueOnce(new Error('receipt lost'))
    expect(await sendWelcomeEmail(deps)).toBe('uncertain')
    expect(await sendWelcomeEmail({ ...deps, attemptId: 'next' })).toBe('skipped')
    expect(deps.send).toHaveBeenCalledTimes(1)
  })

  it('never sends without its own consent', async () => {
    const deps = input(false)
    expect(await sendWelcomeEmail(deps)).toBe('skipped')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('sends once despite concurrent saves and later requests', async () => {
    const deps = input()
    const outcomes = await Promise.all([sendWelcomeEmail(deps), sendWelcomeEmail({ ...deps, attemptId: 'second' })])
    expect(outcomes.sort()).toEqual(['accepted', 'skipped'])
    expect(await sendWelcomeEmail({ ...deps, now: 1000, attemptId: 'third' })).toBe('skipped')
    expect(deps.send).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'account@example.com',
      subject: 'Welcome to skilld',
      text: expect.stringContaining('https://skilld.dev/me'),
      headers: expect.objectContaining({ 'List-Unsubscribe': '<https://skilld.dev/api/unsubscribe?t=signed-token&list=welcome>' }),
    }))
  })

  it.each(['rejected', 'uncertain'] as const)('never repeats a dispatched %s send', async (outcome) => {
    const deps = input()
    deps.send.mockResolvedValueOnce({ _tag: outcome, error: 'unavailable' })
    expect(await sendWelcomeEmail(deps)).toBe(outcome)
    expect(await sendWelcomeEmail({ ...deps, attemptId: 'second' })).toBe('skipped')
    expect(await sendWelcomeEmail({ ...deps, now: 1000, attemptId: 'third' })).toBe('skipped')
    expect(deps.send).toHaveBeenCalledTimes(1)
  })

  it('keeps welcome unsubscribe separate from the two recurring emails', async () => {
    await applyUnsubscribe(d1.db, 900001, 'welcome')
    const deps = input()
    expect(await sendWelcomeEmail(deps)).toBe('skipped')
    expect(deps.send).not.toHaveBeenCalled()
    expect(d1.raw.prepare('SELECT email_opt_in, weekly_opt_out FROM users WHERE id = 900001').get())
      .toMatchObject({ email_opt_in: 0, weekly_opt_out: 0 })
    const html = renderUnsubscribePage({ _tag: 'complete', token: 'token', list: 'welcome', action: 'unsubscribed' })
    expect(html).toContain('Your weekly and digest settings are unchanged.')
    expect(html).not.toContain('/api/unsubscribe/undo')
  })

  it('fences an expired worker before it can dispatch', async () => {
    let release!: () => void
    let entered!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const reached = new Promise<void>((resolve) => {
      entered = resolve
    })
    const deps = input()
    const old = sendWelcomeEmail({ ...deps, signUnsubscribe: async () => {
      entered()
      await held
      return 'token'
    } })
    await reached
    expect(await sendWelcomeEmail({ ...deps, now: 1000, attemptId: 'new' })).toBe('accepted')
    release()
    expect(await old).toBe('skipped')
    expect(deps.send).toHaveBeenCalledTimes(1)
  })

  it('honors unsubscribe while a claimed worker prepares its message', async () => {
    const deps = input()
    expect(await sendWelcomeEmail({ ...deps, signUnsubscribe: async () => {
      await applyUnsubscribe(d1.db, 900001, 'welcome')
      return 'token'
    } })).toBe('skipped')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('records the latest consent address and time after preparation fails', async () => {
    const deps = input()
    await expect(sendWelcomeEmail({ ...deps, signUnsubscribe: async () => {
      throw new Error('signing unavailable')
    } }))
      .rejects
      .toThrow('signing unavailable')
    expect(await sendWelcomeEmail({ ...deps, now: 1000, attemptId: 'new', to: 'new@example.com' })).toBe('accepted')
    expect(d1.raw.prepare('SELECT recipient, consented_at FROM welcome_email_deliveries WHERE user_id = 900001').get())
      .toMatchObject({ recipient: 'new@example.com', consented_at: 1000 })
  })
})
