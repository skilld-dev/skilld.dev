import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { purgeRetainedPersonalData } from '../../layers/identity/server/utils/data-retention'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_227_200
const DAY = 86_400
const ALICE = 9101
const BOB = 9102

describe('purgeRetainedPersonalData', () => {
  let fixture: ReturnType<typeof createSqliteD1>

  beforeEach(() => {
    fixture = createSqliteD1(allMigrations())
    for (const id of [ALICE, BOB]) {
      fixture.raw.prepare(
        `INSERT INTO users (id, github_id, login, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, 900_000 + id, `user-${id}`, NOW - 400 * DAY, NOW)
    }
  })

  afterEach(() => fixture.close())

  function ids(sql: string): unknown[] {
    return fixture.raw.prepare(sql).all().map(row => Object.values(row)[0])
  }

  it('deletes CLI tokens that were revoked or expired more than a week ago', async () => {
    const insert = fixture.raw.prepare(
      `INSERT INTO cli_tokens (
         id, user_id, refresh_hash, kind, created_at, last_used_at, expires_at, revoked_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insert.run(1, ALICE, 'active', 'oauth', NOW - 40 * DAY, NOW, NOW + 20 * DAY, null)
    insert.run(2, ALICE, 'pat-forever', 'pat', NOW - 400 * DAY, NOW - 300 * DAY, null, null)
    insert.run(3, ALICE, 'revoked-old', 'oauth', NOW - 40 * DAY, NOW - 30 * DAY, NOW + 20 * DAY, NOW - 8 * DAY)
    insert.run(4, ALICE, 'revoked-new', 'oauth', NOW - 40 * DAY, NOW - 2 * DAY, NOW + 20 * DAY, NOW - 2 * DAY)
    insert.run(5, BOB, 'expired-old', 'oidc', NOW - 30 * DAY, NOW - 30 * DAY, NOW - 8 * DAY, null)
    insert.run(6, BOB, 'expired-new', 'oidc', NOW - 3 * DAY, NOW - 3 * DAY, NOW - 2 * DAY, null)

    const result = await purgeRetainedPersonalData(fixture.db, NOW)

    expect(result.cliTokens).toBe(2)
    expect(ids('SELECT id FROM cli_tokens ORDER BY id')).toEqual([1, 2, 4, 6])
  })

  it('deletes CLI sign-in codes and device sessions older than one day', async () => {
    const code = fixture.raw.prepare(
      `INSERT INTO cli_auth_codes (
         code, user_id, code_challenge, redirect_port, state, created_at, expires_at
       ) VALUES (?, ?, 'challenge', 49152, 'state', ?, ?)`,
    )
    code.run('old-code', ALICE, NOW - DAY - 1, NOW - DAY + 299)
    code.run('new-code', ALICE, NOW - 60, NOW + 240)
    const device = fixture.raw.prepare(
      `INSERT INTO cli_device_sessions (
         device_code, user_code, user_id, status, created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    device.run('old-device', 'AAAA-AAAA', ALICE, 'authorized', NOW - 2 * DAY, NOW - 2 * DAY + 600)
    device.run('new-device', 'BBBB-BBBB', null, 'pending', NOW - 60, NOW + 540)

    const result = await purgeRetainedPersonalData(fixture.db, NOW)

    expect(result).toMatchObject({ cliAuthCodes: 1, cliDeviceSessions: 1 })
    expect(ids('SELECT code FROM cli_auth_codes')).toEqual(['new-code'])
    expect(ids('SELECT device_code FROM cli_device_sessions')).toEqual(['new-device'])
  })

  it('deletes weekly runs and email preference events older than 90 days', async () => {
    const weekly = fixture.raw.prepare(
      `INSERT INTO weekly_runs (id, user_id, window_start, window_end, status, claimed_at)
       VALUES (?, ?, ?, ?, 'skipped', ?)`,
    )
    weekly.run(1, ALICE, NOW - 98 * DAY, NOW - 91 * DAY, NOW - 91 * DAY)
    weekly.run(2, ALICE, NOW - 14 * DAY, NOW - 7 * DAY, NOW - 7 * DAY)
    const preference = fixture.raw.prepare(
      `INSERT INTO email_preference_events (id, user_id, list, action, occurred_at)
       VALUES (?, ?, 'weekly', ?, ?)`,
    )
    preference.run(1, ALICE, 'unsubscribed', NOW - 91 * DAY)
    preference.run(2, ALICE, 'restored', NOW - 5 * DAY)

    const result = await purgeRetainedPersonalData(fixture.db, NOW)

    expect(result).toMatchObject({ weeklyRuns: 1, emailPreferenceEvents: 1 })
    expect(ids('SELECT id FROM weekly_runs')).toEqual([2])
    expect(ids('SELECT id FROM email_preference_events')).toEqual([2])
  })

  it('keeps the digest run that holds each account cursor and every unresolved run', async () => {
    const skipped = fixture.raw.prepare(
      `INSERT INTO digest_runs (
         id, user_id, delivery_key, window_start, window_end, cursor_start, cursor_end,
         status, claim_token, claimed_at, finished_at
       ) VALUES (?, ?, ?, ?, ?, 0, ?, 'skipped', 'claim', ?, ?)`,
    )
    // Alice: two old processed runs. Only the newest carries her cursor.
    skipped.run(1, ALICE, 'a-1', NOW - 200 * DAY, NOW - 150 * DAY, 10, NOW - 150 * DAY, NOW - 150 * DAY)
    skipped.run(2, ALICE, 'a-2', NOW - 150 * DAY, NOW - 120 * DAY, 20, NOW - 120 * DAY, NOW - 120 * DAY)
    // Bob: one old processed run, one recent one.
    skipped.run(3, BOB, 'b-1', NOW - 150 * DAY, NOW - 100 * DAY, 10, NOW - 100 * DAY, NOW - 100 * DAY)
    skipped.run(4, BOB, 'b-2', NOW - 100 * DAY, NOW - 5 * DAY, 30, NOW - 5 * DAY, NOW - 5 * DAY)
    // Bob: an old failed run still waits for a retry.
    fixture.raw.prepare(
      `INSERT INTO digest_runs (
         id, user_id, delivery_key, window_start, window_end, cursor_start, cursor_end,
         status, claim_token, claimed_at, finished_at, error_code, error_message
       ) VALUES (5, ?, 'b-0', ?, ?, 0, 5, 'failed', 'claim', ?, ?, 'provider', 'down')`,
    ).run(BOB, NOW - 300 * DAY, NOW - 200 * DAY, NOW - 200 * DAY, NOW - 200 * DAY)

    const result = await purgeRetainedPersonalData(fixture.db, NOW)

    expect(result.digestRuns).toBe(2)
    expect(ids('SELECT id FROM digest_runs ORDER BY id')).toEqual([2, 4, 5])
  })
})
