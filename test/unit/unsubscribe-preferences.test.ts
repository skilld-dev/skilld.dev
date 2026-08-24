import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  applyResubscribe,
  applyUnsubscribe,
  renderUnsubscribePage,
} from '../../layers/identity/server/utils/unsubscribe'

describe('email preference recovery', () => {
  it('can restore the digest after unsubscribe', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, email_opt_in INTEGER NOT NULL, weekly_opt_out INTEGER NOT NULL);
      CREATE TABLE email_preference_events (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, list TEXT NOT NULL,
        action TEXT NOT NULL, occurred_at INTEGER NOT NULL
      );
      INSERT INTO users VALUES (1, 1, 0);
    `)
    const db = sqliteDb(sqlite)

    await applyUnsubscribe(db, 1, 'digest')
    await applyResubscribe(db, 1, 'digest')

    expect(sqlite.prepare('SELECT email_opt_in FROM users WHERE id = 1').get()).toEqual({ email_opt_in: 1 })
    expect(sqlite.prepare('SELECT action FROM email_preference_events ORDER BY id').all())
      .toEqual([{ action: 'unsubscribed' }, { action: 'restored' }])
    sqlite.close()
  })

  it('renders a branded confirmation before changing a setting', () => {
    const html = renderUnsubscribePage({
      _tag: 'confirm',
      token: 'signed-token',
      list: 'digest',
    })

    expect(html).toContain('<form method="post"')
    expect(html).toContain('Stop digest emails')
    expect(html).toContain('skilld')
    expect(html).toContain(':focus-visible')
    expect(html).toContain('color-scheme:light dark')
  })

  it('renders an undo action after a setting changed', () => {
    const html = renderUnsubscribePage({
      _tag: 'complete',
      token: 'signed-token',
      list: 'digest',
      action: 'unsubscribed',
    })

    expect(html).toContain('/api/unsubscribe/undo')
    expect(html).toContain('Restore digest emails')
  })
})

function sqliteDb(sqlite: Database.Database): D1Database {
  const prepare = (sql: string) => ({
    sql,
    bindings: [] as unknown[],
    bind(...bindings: unknown[]) {
      return { ...this, bindings }
    },
  })
  return {
    prepare,
    async batch(statements: Array<{ sql: string, bindings: unknown[] }>) {
      const transaction = sqlite.transaction(() => statements.map((statement) => {
        const params: unknown[] = []
        const expanded = statement.sql.replace(/\?(\d+)/g, (_, raw: string) => {
          params.push(statement.bindings[Number(raw) - 1])
          return '?'
        })
        const result = sqlite.prepare(expanded).run(...params)
        return { meta: { changes: result.changes } }
      }))
      return transaction()
    },
  } as unknown as D1Database
}
