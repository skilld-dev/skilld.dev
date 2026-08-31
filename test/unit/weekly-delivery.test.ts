import type { WeeklyDeliveryDependencies } from '../../layers/identity/server/utils/weekly-delivery'
import type { WeeklyRecipient } from '../../layers/identity/server/utils/weekly-select'
import type { WeeklyTrendingSkill } from '../../layers/identity/server/utils/weekly-template'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWeeklyForUser } from '../../layers/identity/server/utils/weekly-delivery'
import {
  loadWeeklyRecipients,
  resolveRecipientAddress,
} from '../../layers/identity/server/utils/weekly-select'
import { renderWeekly } from '../../layers/identity/server/utils/weekly-template'

const WINDOW_END = 1_755_648_000
const WINDOW_START = WINDOW_END - 7 * 86_400

const SCHEMA = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL,
  email TEXT,
  digest_email TEXT,
  email_opt_in INTEGER NOT NULL DEFAULT 0,
  weekly_opt_out INTEGER NOT NULL DEFAULT 0,
  name TEXT
);
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT,
  name TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  sha TEXT NOT NULL
);
CREATE TABLE skills (
  owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL,
  slug TEXT NOT NULL, description TEXT, current_sha TEXT, rendered_skill_path TEXT,
  source_resolved INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (owner, repo, name)
);
CREATE TABLE repos (
  owner TEXT NOT NULL, repo TEXT NOT NULL,
  repo_kind TEXT NOT NULL DEFAULT 'creator',
  PRIMARY KEY (owner, repo)
);
CREATE TABLE skill_likes (
  user_id INTEGER NOT NULL, owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, owner, repo, name)
);
CREATE TABLE skill_revisions (
  owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL, sha TEXT NOT NULL,
  modified_at INTEGER NOT NULL, message TEXT,
  PRIMARY KEY (owner, repo, name, sha)
);
CREATE TABLE weekly_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  liked_count INTEGER NOT NULL DEFAULT 0,
  trending_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('claimed','sent','skipped','failed','uncertain')),
  provider_message_id TEXT,
  provider_status TEXT,
  claimed_at INTEGER NOT NULL,
  sent_at INTEGER,
  error TEXT
);
CREATE UNIQUE INDEX weekly_runs_user_window ON weekly_runs (user_id, window_end);
CREATE TABLE weekly_skill_sends (
  window_end INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (window_end, owner, repo, name)
);
`

describe('weekly delivery', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(SCHEMA)
    db = wrapSqlite(sqlite)
    sqlite.prepare(`INSERT INTO users (id, login, email, digest_email) VALUES (1, 'harlan-zw', 'harlan@example.com', NULL)`).run()
  })

  afterEach(() => sqlite.close())

  it('sends once and refuses the replay of the same week', async () => {
    const send = vi.fn(async () => ({ _tag: 'accepted' as const, messageId: 'msg-1' }))

    const first = await runWeeklyForUser(deps({ send }), recipient(), delivery())
    const second = await runWeeklyForUser(deps({ send }), recipient(), delivery())

    expect(first).toMatchObject({ _tag: 'sent', providerMessageId: 'msg-1' })
    expect(second).toEqual({ _tag: 'already_claimed' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(runRows()).toHaveLength(1)
    expect(runRows()[0]).toMatchObject({ status: 'sent', provider_status: 'accepted' })
    expect(sqlite.prepare(`SELECT owner, repo, name FROM weekly_skill_sends`).all())
      .toEqual([{ owner: 'antfu', repo: 'skills', name: 'vitest' }])
  })

  it('claims a different week separately', async () => {
    const send = vi.fn(async () => ({ _tag: 'accepted' as const, messageId: 'msg-1' }))

    await runWeeklyForUser(deps({ send }), recipient(), delivery())
    const next = await runWeeklyForUser(deps({ send }), recipient(), delivery({
      windowStart: WINDOW_END,
      windowEnd: WINDOW_END + 7 * 86_400,
    }))

    expect(next).toMatchObject({ _tag: 'sent' })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not mail a week with nothing in it', async () => {
    const send = vi.fn()

    const result = await runWeeklyForUser(deps({ send }), recipient(), delivery({ trending: [] }))

    expect(result).toEqual({ _tag: 'skipped', reason: 'nothing_to_say' })
    expect(send).not.toHaveBeenCalled()
    expect(runRows()[0]).toMatchObject({ status: 'skipped' })
  })

  it('never claims a week for someone with no address', async () => {
    const send = vi.fn()

    const result = await runWeeklyForUser(
      deps({ send }),
      recipient({ email: null, digest_email: null }),
      delivery(),
    )

    expect(result).toEqual({ _tag: 'skipped', reason: 'no_address' })
    expect(runRows()).toHaveLength(0)
  })

  it('prefers the verified address over the profile one', () => {
    expect(resolveRecipientAddress(recipient({ digest_email: ' verified@example.com ' })))
      .toEqual({ _tag: 'ok', email: 'verified@example.com' })
  })

  it('records a rejected send and leaves the week claimed', async () => {
    const send = vi.fn(async () => ({ _tag: 'rejected' as const, error: 'unverified destination' }))

    const result = await runWeeklyForUser(deps({ send }), recipient(), delivery())

    expect(result).toMatchObject({ _tag: 'failed', stage: 'provider', error: 'unverified destination' })
    expect(runRows()[0]).toMatchObject({ status: 'failed', error: 'unverified destination', sent_at: null })
  })

  it('treats an uncertain provider answer as sent rather than retrying it', async () => {
    const send = vi.fn(async () => ({ _tag: 'uncertain' as const, error: 'no message id' }))

    const first = await runWeeklyForUser(deps({ send }), recipient(), delivery())
    const replay = await runWeeklyForUser(deps({ send }), recipient(), delivery())

    expect(first).toMatchObject({ _tag: 'uncertain' })
    expect(replay).toEqual({ _tag: 'already_claimed' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes from the weekly, not from the watched-repo digest', async () => {
    const send = vi.fn(async () => ({ _tag: 'accepted' as const, messageId: 'msg-1' }))

    await runWeeklyForUser(deps({ send }), recipient(), delivery())

    const sent = send.mock.calls[0]![0] as { headers: Record<string, string> }
    expect(sent.headers['List-Unsubscribe']).toContain('list=weekly')
    expect(sent.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('leaves out anyone who opted out or has no address', async () => {
    sqlite.prepare(`INSERT INTO users (id, login, email, weekly_opt_out) VALUES (2, 'opted-out', 'b@example.com', 1)`).run()
    sqlite.prepare(`INSERT INTO users (id, login, email) VALUES (3, 'no-address', '   ')`).run()
    sqlite.prepare(`INSERT INTO users (id, login, email, digest_email) VALUES (4, 'verified-only', NULL, 'd@example.com')`).run()
    sqlite.prepare(`INSERT INTO users (id, login, email, email_opt_in) VALUES (5, 'digest-enabled', 'e@example.com', 1)`).run()

    const recipients = await loadWeeklyRecipients(db)

    expect(recipients.map(user => user.login).sort()).toEqual(['digest-enabled', 'harlan-zw', 'verified-only'])
  })
})

function recipient(overrides: Partial<WeeklyRecipient> = {}): WeeklyRecipient {
  return { id: 1, login: 'harlan-zw', name: 'Harlan', email: 'harlan@example.com', digest_email: null, ...overrides }
}

function trendingSkill(): WeeklyTrendingSkill {
  return {
    owner: 'antfu',
    repo: 'skills',
    slug: 'vitest',
    canonicalName: 'vitest',
    description: 'Testing conventions.',
    stars: 12_400,
    sourceUrl: 'https://github.com/antfu/skills/blob/current/vitest/SKILL.md',
    reason: { _tag: 'named', authorCount: 3, mentionCount: 5 },
    evidence: null,
  }
}

function delivery(overrides: Partial<Parameters<typeof runWeeklyForUser>[2]> = {}) {
  return {
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    trending: [trendingSkill()],
    siteUrl: 'https://skilld.dev',
    ...overrides,
  }
}

let activeDb: D1Database
let activeSqlite: Database.Database

function deps(overrides: Partial<WeeklyDeliveryDependencies>): WeeklyDeliveryDependencies {
  return {
    db: activeDb,
    now: () => WINDOW_END,
    render: renderWeekly,
    signUnsubscribe: async userId => `token-${userId}`,
    send: async () => ({ _tag: 'accepted', messageId: 'msg-1' }),
    ...overrides,
  }
}

function runRows() {
  return activeSqlite.prepare(`SELECT * FROM weekly_runs ORDER BY id`).all() as Array<Record<string, unknown>>
}

function wrapSqlite(sqlite: Database.Database): D1Database {
  activeSqlite = sqlite
  const prepare = (sql: string) => {
    const make = (params: unknown[]): D1PreparedStatement => ({
      sql,
      params,
      bind: (...next: unknown[]) => make(next),
      async run() {
        const expanded = expand(sql, params)
        const result = sqlite.prepare(expanded.sql).run(...expanded.params)
        return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } } as unknown as D1Result
      },
      async first<T>() {
        const expanded = expand(sql, params)
        return (sqlite.prepare(expanded.sql).get(...expanded.params) as T | undefined) ?? null
      },
      async all<T>() {
        const expanded = expand(sql, params)
        return { results: sqlite.prepare(expanded.sql).all(...expanded.params) as T[] } as D1Result<T>
      },
    } as unknown as D1PreparedStatement)
    return make([])
  }
  activeDb = {
    prepare,
    batch: async (statements: Array<D1PreparedStatement & { sql: string, params: unknown[] }>) =>
      statements.map((statement) => {
        const expanded = expand(statement.sql, statement.params)
        const result = sqlite.prepare(expanded.sql).run(...expanded.params)
        return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } }
      }) as unknown as D1Result[],
  } as unknown as D1Database
  return activeDb
}

function expand(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
  const expanded: unknown[] = []
  const nextSql = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(params[Number(raw) - 1])
    return '?'
  })
  return expanded.length ? { sql: nextSql, params: expanded } : { sql, params }
}
