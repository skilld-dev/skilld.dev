import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import weeklyReport from '../../layers/admin/server/api/admin/weekly.get'
import { summarizeWeeklyEngagement } from '../../layers/admin/server/utils/weekly-engagement'
import { loadWeeklyRecipients } from '../../layers/identity/server/utils/weekly-select'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

vi.hoisted(() => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
})

describe('weekly admin engagement', () => {
  it('reports the unsubscribe rate per accepted recipient', () => {
    expect(summarizeWeeklyEngagement({
      accepted: 12,
      unsubscribes: 1,
    })).toEqual({
      unsubscribes: 1,
      unsubscribeRate: 1 / 12,
    })
  })

  it('does not invent rates when nobody was accepted', () => {
    expect(summarizeWeeklyEngagement({
      accepted: 0,
      unsubscribes: 0,
    })).toMatchObject({
      unsubscribeRate: null,
    })
  })
})

describe('weekly admin audience', () => {
  let d1: SqliteD1

  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec('DELETE FROM users')
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('getUserSession', async () => ({ user: { id: 1, login: 'admin' } }))
    vi.stubGlobal('requireAdmin', async () => ({ email: 'admin@example.com' }))
  })

  afterEach(() => {
    d1.close()
    vi.unstubAllGlobals()
  })

  function event(): H3Event {
    return { context: { platform: { db: d1.db } } } as unknown as H3Event
  }

  it('counts only consenting recipients and preserves the other audience counts', async () => {
    d1.raw.exec(`
      INSERT INTO users (github_id, login, email, digest_email, email_opt_in, weekly_opt_out, created_at, last_login_at)
      VALUES
        (1, 'profile-only', 'profile@example.com', NULL, 0, 0, 1, 1),
        (2, 'digest-enabled', 'digest@example.com', NULL, 1, 0, 1, 1),
        (3, 'verified-address', NULL, 'verified@example.com', 0, 0, 1, 1),
        (4, 'opted-out', 'out@example.com', NULL, 1, 1, 1, 1),
        (5, 'no-address', '   ', NULL, 1, 0, 1, 1);
    `)

    const report = await weeklyReport(event())
    const recipients = await loadWeeklyRecipients(d1.db)

    expect(report.audience).toEqual({ reachable: 2, optedOut: 1, noAddress: 1 })
    expect(report.audience.reachable).toBe(recipients.length)
  })

  it('returns zero counts when there are no users', async () => {
    expect((await weeklyReport(event())).audience).toEqual({ reachable: 0, optedOut: 0, noAddress: 0 })
  })
})
