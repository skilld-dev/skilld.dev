import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planAccountSettings, updateAccountSettings } from '../../layers/identity/server/utils/account-settings'
import { loadDigestEligibleUsers } from '../../layers/identity/server/utils/digest-select'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

describe('email choices complete account setup', () => {
  let d1: SqliteD1
  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec(`INSERT INTO users (id, github_id, login, email, created_at, last_login_at)
      VALUES (900001, 900001, 'new-account', 'account@example.com', 1, 1)`)
  })
  afterEach(() => d1.close())

  it('makes a digest opt-in eligible without a separate onboarding request', async () => {
    const plan = planAccountSettings({ email: 'account@example.com', digest_email: null }, { digest: true, weekly: false })
    if (plan._tag !== 'Ok')
      throw new Error('Expected valid email choices')
    await updateAccountSettings(d1.db, 900001, plan.columns)
    expect((await loadDigestEligibleUsers(d1.db)).map(user => user.login)).toEqual(['new-account'])
  })

  it('records an explicit opt-out without enabling either email', async () => {
    await updateAccountSettings(d1.db, 900001, { email_opt_in: 0, weekly_opt_out: 1 })
    const row = d1.raw.prepare('SELECT onboarded_at, email_opt_in, weekly_opt_out FROM users WHERE id = 900001').get()
    expect(row).toMatchObject({ onboarded_at: expect.any(Number), email_opt_in: 0, weekly_opt_out: 1 })
    expect(await loadDigestEligibleUsers(d1.db)).toEqual([])
  })

  it('keeps the original completion date on later email changes', async () => {
    d1.raw.exec('UPDATE users SET onboarded_at = 123 WHERE id = 900001')
    await updateAccountSettings(d1.db, 900001, { email_opt_in: 1 })
    expect(d1.raw.prepare('SELECT onboarded_at FROM users WHERE id = 900001').get()).toEqual({ onboarded_at: 123 })
  })

  it('leaves setup incomplete for privacy or address-only changes', async () => {
    await updateAccountSettings(d1.db, 900001, { likes_public: 0, digest_email: 'changed@example.com' })
    expect(d1.raw.prepare('SELECT onboarded_at FROM users WHERE id = 900001').get()).toEqual({ onboarded_at: null })
  })
})
