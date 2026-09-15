import type { UserRow } from '../../layers/identity/server/utils/users'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { mePresenter } from '../../layers/identity/server/presenters/user'
import { loadWeeklyRecipients } from '../../layers/identity/server/utils/weekly-select'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 1,
    github_id: 1,
    login: 'profile-only',
    name: null,
    email: 'captured@example.com',
    avatar: null,
    digest_email: null,
    email_opt_in: 0,
    weekly_opt_out: 0,
    timezone: 'UTC',
    stars_synced_at: null,
    onboarded_at: null,
    last_login_at: 1,
    ...overrides,
  }
}

describe('mePresenter weekly indicator', () => {
  it('does not report the weekly as active for a user the consent gate excludes', () => {
    const me = mePresenter(userRow())

    expect(me.weekly_opt_in).toBe(false)
  })

  it('reports the weekly as active only when the gate would deliver', () => {
    expect(mePresenter(userRow({ email_opt_in: 1 })).weekly_opt_in).toBe(true)
    expect(mePresenter(userRow({ digest_email: 'me@example.com' })).weekly_opt_in).toBe(true)
    expect(mePresenter(userRow({ weekly_opt_out: 1, digest_email: 'me@example.com' })).weekly_opt_in).toBe(false)
    expect(mePresenter(userRow({ email_opt_in: 1, email: null })).weekly_opt_in).toBe(false)
    expect(mePresenter(userRow({ email: '   ' })).weekly_opt_in).toBe(false)
  })
})

describe('dashboard weekly indicator against the delivery list', () => {
  let d1: SqliteD1

  afterEach(() => d1.close())

  it('reports active for exactly the users loadWeeklyRecipients delivers to', async () => {
    d1 = createSqliteD1(allMigrations())
    const rows: UserRow[] = [
      userRow({ id: 1, github_id: 1, login: 'profile-only' }),
      userRow({ id: 2, github_id: 2, login: 'opted-out', weekly_opt_out: 1, digest_email: 'd@example.com' }),
      userRow({ id: 3, github_id: 3, login: 'digest-enabled', email_opt_in: 1 }),
      userRow({ id: 4, github_id: 4, login: 'verified-only', email: null, digest_email: 'v@example.com' }),
      userRow({ id: 5, github_id: 5, login: 'resubscribed', digest_email: 'r@example.com' }),
      userRow({ id: 6, github_id: 6, login: 'no-address', email: null, email_opt_in: 1 }),
    ]
    const insert = d1.raw.prepare(`
      INSERT INTO users (github_id, login, email, digest_email, email_opt_in, weekly_opt_out, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `)
    for (const u of rows) {
      insert.run(u.github_id, u.login, u.email, u.digest_email, u.email_opt_in, u.weekly_opt_out)
    }

    const recipients = await loadWeeklyRecipients(d1.db)
    const delivered = new Set(recipients.map(user => user.login))

    for (const u of rows)
      expect(mePresenter(u).weekly_opt_in, `${u.login}`).toBe(delivered.has(u.login))
  })
})
