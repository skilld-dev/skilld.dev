import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

describe('AI Ready route listing cost', () => {
  it('returns ordered eligible pages without scanning and sorting every eligible route', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE ai_ready_pages (
        route TEXT PRIMARY KEY, title TEXT, description TEXT, headings TEXT,
        keywords TEXT, updated_at INTEGER, is_error INTEGER, locale TEXT,
        indexed INTEGER, indexnow_synced_at INTEGER, indexed_at INTEGER
      );
      CREATE INDEX idx_ai_ready_pages_indexed_is_error ON ai_ready_pages(indexed, is_error);
      CREATE INDEX idx_ai_ready_pages_indexnow_scan ON ai_ready_pages(indexed, is_error, indexnow_synced_at, indexed_at);
    `)
    const insert = db.prepare('INSERT INTO ai_ready_pages(route,title,indexed,is_error) VALUES(?,?,?,?)')
    db.transaction(() => {
      for (let i = 0; i < 20_000; i++) {
        const route = `/page/${String(i).padStart(5, '0')}`
        insert.run(route, `Page ${i}`, i % 2, i % 5 === 0 ? 1 : 0)
      }
    })()
    const migration = readFileSync('migrations/0136_ai_ready_route_order_index.sql', 'utf8')
    db.exec(migration)
    db.exec(migration)
    const sql = 'SELECT route, title, description, headings, keywords, updated_at, is_error, locale FROM ai_ready_pages WHERE indexed = ? AND is_error = 0 ORDER BY route LIMIT ?'
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(1, 3) as Array<{ detail: string }>
    expect(plan.map(row => row.detail).join('\n')).not.toContain('TEMP B-TREE')
    expect(db.prepare(sql).all(1, 3)).toMatchObject([
      { route: '/page/00001', title: 'Page 1' },
      { route: '/page/00003', title: 'Page 3' },
      { route: '/page/00007', title: 'Page 7' },
    ])
    db.close()
  })
})
