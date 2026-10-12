import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateAccountSettings } from '../../layers/identity/server/utils/account-settings'
import { upsertUserFromGithub } from '../../layers/identity/server/utils/users'
import { loadWeeklyRecipients } from '../../layers/identity/server/utils/weekly-select'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

vi.mock('../../layers/identity/server/utils/crypto', () => ({
  encryptToken: async () => 'encrypted',
}))
vi.mock('#app/nuxt', async importOriginal => ({
  ...await importOriginal<typeof import('#app/nuxt')>(),
  useRuntimeConfig: () => ({ tokenKey: 'key' }),
}))

describe('signup weekly choices', () => {
  let d1: SqliteD1
  const credentials = {
    accessToken: 'token',
    accessTokenExpiresIn: null,
    refreshToken: null,
    refreshTokenExpiresIn: null,
    clientId: 'client',
    scopes: ['read:user', 'user:email'],
  }

  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
  })
  afterEach(() => {
    d1.close()
    vi.unstubAllGlobals()
  })
  const profile = { id: 900002, login: 'signup-quiet', email: 'signup@example.com' }
  function event(): H3Event {
    return { context: { platform: { db: d1.db } } } as unknown as H3Event
  }

  it('keeps the weekly off when a new account saves an address before choosing emails', async () => {
    const result = await upsertUserFromGithub(event(), profile, credentials)
    await updateAccountSettings(d1.db, result.user.id, { digest_email: 'chosen@example.com' })
    const recipients = await loadWeeklyRecipients(d1.db)
    expect(recipients.map(user => user.login)).not.toContain(profile.login)
    expect(result.user.weekly_opt_out).toBe(1)
  })

  it('preserves an existing account weekly choice when it signs in again', async () => {
    d1.raw.exec(`INSERT INTO users (github_id, login, digest_email, weekly_opt_out, created_at, last_login_at)
      VALUES (900002, 'signup-quiet', 'chosen@example.com', 0, 1, 1)`)
    const result = await upsertUserFromGithub(event(), profile, credentials)
    expect(result.user.weekly_opt_out).toBe(0)
    expect((await loadWeeklyRecipients(d1.db)).map(user => user.login)).toContain(profile.login)
  })
})
