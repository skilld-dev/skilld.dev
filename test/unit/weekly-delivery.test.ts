import type { WeeklyDeliveryDependencies } from '../../layers/identity/server/utils/weekly-delivery'
import type { WeeklyRecipient } from '../../layers/identity/server/utils/weekly-select'
import type { WeeklyTrendingSkill } from '../../layers/identity/server/utils/weekly-template'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWeeklyForUser } from '../../layers/identity/server/utils/weekly-delivery'
import {
  loadWeeklyRecipients,
  resolveRecipientAddress,
  selectWeeklyForUser,
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
  weekly_opt_out INTEGER NOT NULL DEFAULT 0
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
  slug TEXT NOT NULL, description TEXT,
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
  claimed_at INTEGER NOT NULL,
  sent_at INTEGER,
  error TEXT
);
CREATE UNIQUE INDEX weekly_runs_user_window ON weekly_runs (user_id, window_end);
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

    const recipients = await loadWeeklyRecipients(db)

    expect(recipients.map(user => user.login).sort()).toEqual(['harlan-zw', 'verified-only'])
  })
})

describe('weekly selection', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(SCHEMA)
    db = wrapSqlite(sqlite)
    sqlite.prepare(`INSERT INTO users (id, login, email) VALUES (1, 'harlan-zw', 'harlan@example.com')`).run()
    sqlite.prepare(`INSERT INTO repos (owner, repo) VALUES ('antfu', 'skills')`).run()
  })

  afterEach(() => sqlite.close())

  function seedSkill(name: string) {
    sqlite.prepare(`INSERT INTO skills (owner, repo, name, slug, description) VALUES ('antfu', 'skills', ?, ?, 'desc')`)
      .run(name, name)
  }

  function like(name: string) {
    sqlite.prepare(`INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (1, 'antfu', 'skills', ?, 0)`).run(name)
  }

  function change(name: string, at: number) {
    sqlite.prepare(`INSERT INTO activity (type, owner, repo, name, occurred_at, sha) VALUES ('modified', 'antfu', 'skills', ?, ?, 'sha')`)
      .run(name, at)
  }

  it('lists only skills this person liked', async () => {
    seedSkill('vitest')
    seedSkill('vite')
    like('vitest')
    change('vitest', WINDOW_END - 100)
    change('vite', WINDOW_END - 100)

    const selection = await selectWeeklyForUser(db, recipient(), WINDOW_START, WINDOW_END)

    expect(selection.likedChanges.map(entry => entry.name)).toEqual(['vitest'])
  })

  it('ignores changes outside the window', async () => {
    seedSkill('vitest')
    like('vitest')
    change('vitest', WINDOW_START - 10)

    const selection = await selectWeeklyForUser(db, recipient(), WINDOW_START, WINDOW_END)

    expect(selection.likedChanges).toEqual([])
  })

  it('lists five and counts the rest as overflow', async () => {
    for (let index = 0; index < 8; index++) {
      seedSkill(`skill-${index}`)
      like(`skill-${index}`)
      change(`skill-${index}`, WINDOW_END - index * 3600)
    }

    const selection = await selectWeeklyForUser(db, recipient(), WINDOW_START, WINDOW_END)

    expect(selection.likedChanges).toHaveLength(5)
    expect(selection.likedOverflow).toBe(3)
  })

  it('counts every change to one skill as one row', async () => {
    seedSkill('vitest')
    like('vitest')
    change('vitest', WINDOW_END - 7200)
    change('vitest', WINDOW_END - 3600)

    const selection = await selectWeeklyForUser(db, recipient(), WINDOW_START, WINDOW_END)

    expect(selection.likedChanges).toHaveLength(1)
    expect(selection.likedChanges[0]).toMatchObject({ changeCount: 2, changedAt: WINDOW_END - 3600 })
  })

  it('carries the window commits newest first', async () => {
    seedSkill('vitest')
    like('vitest')
    change('vitest', WINDOW_END - 3600)
    sqlite.prepare(`INSERT INTO skill_revisions (owner, repo, name, sha, modified_at, message) VALUES ('antfu','skills','vitest','a', ?, ?)`)
      .run(WINDOW_END - 7200, 'older subject')
    sqlite.prepare(`INSERT INTO skill_revisions (owner, repo, name, sha, modified_at, message) VALUES ('antfu','skills','vitest','b', ?, ?)`)
      .run(WINDOW_END - 3600, 'newest subject')

    const selection = await selectWeeklyForUser(db, recipient(), WINDOW_START, WINDOW_END)

    expect(selection.likedChanges[0]!.commitMessages).toEqual(['newest subject', 'older subject'])
  })

  it('leaves out commits from outside the window', async () => {
    seedSkill('vitest')
    like('vitest')
    change('vitest', WINDOW_END - 3600)
    sqlite.prepare(`INSERT INTO skill_revisions (owner, repo, name, sha, modified_at, message) VALUES ('antfu','skills','vitest','old', ?, ?)`)
      .run(WINDOW_START - 10, 'last month')
    sqlite.prepare(`INSERT INTO skill_revisions (owner, repo, name, sha, modified_at, message) VALUES ('antfu','skills','vitest','new', ?, ?)`)
      .run(WINDOW_END - 3600, 'this week')

    const selection = await selectWeeklyForUser(db, recipient(), WINDOW_START, WINDOW_END)

    expect(selection.likedChanges[0]!.commitMessages).toEqual(['this week'])
  })

  it('leaves out aggregator repositories', async () => {
    sqlite.prepare(`UPDATE repos SET repo_kind = 'aggregator' WHERE owner = 'antfu'`).run()
    seedSkill('vitest')
    like('vitest')
    change('vitest', WINDOW_END - 100)

    const selection = await selectWeeklyForUser(db, recipient(), WINDOW_START, WINDOW_END)

    expect(selection.likedChanges).toEqual([])
  })
})

function recipient(overrides: Partial<WeeklyRecipient> = {}): WeeklyRecipient {
  return { id: 1, login: 'harlan-zw', email: 'harlan@example.com', digest_email: null, ...overrides }
}

function trendingSkill(): WeeklyTrendingSkill {
  return {
    owner: 'antfu',
    repo: 'skills',
    slug: 'vitest',
    canonicalName: 'vitest',
    description: 'Testing conventions.',
    stars: 12_400,
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
    select: selectWeeklyForUser,
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
        return { results: sqlite.prepare(expanded.sql).all(...expanded.params), meta: { changes: 0 } }
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
