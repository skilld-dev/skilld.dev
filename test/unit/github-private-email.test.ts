import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchVerifiedPrimaryEmail, pickVerifiedPrimaryEmail } from '../../layers/identity/server/utils/github-emails'
import { upsertUserFromGithub } from '../../layers/identity/server/utils/users'
import { loadWeeklyRecipients } from '../../layers/identity/server/utils/weekly-select'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// users.ts reads its key from the auto-imported runtime config, which is empty
// under the Nuxt test environment. These tests are about the stored email, so
// the encryption boundary is replaced and the upsert SQL runs for real.
vi.mock('../../layers/identity/server/utils/crypto', () => ({
  encryptToken: async (plaintext: string) => `encrypted:${plaintext.length}`,
}))

describe('pickVerifiedPrimaryEmail', () => {
  it('returns the primary address when GitHub verified it', () => {
    expect(pickVerifiedPrimaryEmail([
      { email: 'work@example.com', primary: false, verified: true },
      { email: 'me@example.com', primary: true, verified: true },
    ])).toBe('me@example.com')
  })

  it('returns null when the primary address is unverified', () => {
    expect(pickVerifiedPrimaryEmail([
      { email: 'me@example.com', primary: true, verified: false },
      { email: 'work@example.com', primary: false, verified: true },
    ])).toBeNull()
  })

  it('returns null when no address is primary', () => {
    expect(pickVerifiedPrimaryEmail([
      { email: 'work@example.com', primary: false, verified: true },
    ])).toBeNull()
  })

  it('returns null for a payload that is not an email list', () => {
    expect(pickVerifiedPrimaryEmail({ message: 'Bad credentials' })).toBeNull()
    expect(pickVerifiedPrimaryEmail([{ email: 42, primary: true, verified: true }])).toBeNull()
  })
})

describe('fetchVerifiedPrimaryEmail', () => {
  it('reads the verified primary address with the user token', async () => {
    const fetcher = vi.fn(async () => Response.json([
      { email: 'me@example.com', primary: true, verified: true },
    ]))

    await expect(fetchVerifiedPrimaryEmail('user-token', fetcher)).resolves.toBe('me@example.com')
    expect(fetcher).toHaveBeenCalledWith('https://api.github.com/user/emails', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer user-token' }),
    }))
  })

  it('rejects with the status and without the token when GitHub refuses', async () => {
    const fetcher = vi.fn(async () => new Response('forbidden', { status: 403 }))

    const failure = await fetchVerifiedPrimaryEmail('user-token', fetcher).then(
      () => { throw new Error('expected a rejection') },
      (error: Error) => error,
    )
    expect(failure.message).toContain('403')
    expect(failure.message).not.toContain('user-token')
  })
})

describe('upsertUserFromGithub email', () => {
  let d1: SqliteD1

  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
  })

  afterEach(() => {
    d1.close()
  })

  const credentials = {
    accessToken: 'user-token',
    accessTokenExpiresIn: null,
    refreshToken: null,
    refreshTokenExpiresIn: null,
    clientId: 'client',
    scopes: ['read:user', 'user:email'],
  }

  function event(): H3Event {
    return { context: { platform: { db: d1.db } } } as unknown as H3Event
  }

  it('keeps a stored email when a later sign-in finds none', async () => {
    await upsertUserFromGithub(event(), { id: 1, login: 'octo', email: 'me@example.com' }, credentials)
    const row = await upsertUserFromGithub(event(), { id: 1, login: 'octo', email: null }, credentials)

    expect(row.email).toBe('me@example.com')
  })

  it('replaces a stored email when GitHub reports a new one', async () => {
    await upsertUserFromGithub(event(), { id: 1, login: 'octo', email: 'old@example.com' }, credentials)
    const row = await upsertUserFromGithub(event(), { id: 1, login: 'octo', email: 'new@example.com' }, credentials)

    expect(row.email).toBe('new@example.com')
  })

  it('never enrolls a never-consenting user in the weekly list', async () => {
    d1.raw.exec(`
      INSERT INTO users (
        github_id, login, email, digest_email, email_opt_in, weekly_opt_out,
        onboarded_at, created_at, last_login_at
      ) VALUES (7, 'quiet', NULL, NULL, 0, 0, 1, 1, 1);
    `)

    await upsertUserFromGithub(event(), { id: 7, login: 'quiet', email: 'me@example.com' }, credentials)

    const recipients = await loadWeeklyRecipients(d1.db)
    expect(recipients.map(user => user.login)).toEqual([])
  })
})
