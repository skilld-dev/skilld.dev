import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderDigest } from '../../layers/identity/server/utils/digest-template'
import {
  digestRunMetrics,
  instrumentDigestHtml,
  linkKeyForUrl,
  listDigestRunEngagement,
  recordDigestEvent,
  signDigestEventToken,
  verifyDigestEventToken,
} from '../../layers/identity/server/utils/digest-tracking'

const SECRET = 'digest-tracking-test-secret'
const NOW = 1_754_265_600 // fixed epoch for deterministic exp handling

describe('digest event tokens', () => {
  it('round-trips an open token', async () => {
    const token = await signDigestEventToken({ runId: 42, event: 'open' }, SECRET, () => NOW)
    const payload = await verifyDigestEventToken(token, SECRET, () => NOW)
    expect(payload).toMatchObject({ r: 42, e: 'open' })
    expect(payload?.u).toBeUndefined()
  })

  it('round-trips a click token with its destination URL', async () => {
    const url = 'https://skilld.dev/gh/acme/skills/alpha'
    const token = await signDigestEventToken({ runId: 7, event: 'click', url }, SECRET, () => NOW)
    const payload = await verifyDigestEventToken(token, SECRET, () => NOW)
    expect(payload).toMatchObject({ r: 7, e: 'click', u: url })
  })

  it('rejects a tampered payload', async () => {
    const token = await signDigestEventToken({ runId: 7, event: 'open' }, SECRET, () => NOW)
    const [payload, sig] = token.split('.')
    const forged = `${btoa(JSON.stringify({ r: 999, e: 'open', exp: NOW + 999_999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}.${sig}`
    expect(await verifyDigestEventToken(forged, SECRET, () => NOW)).toBeNull()
    expect(payload).toBeTruthy()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signDigestEventToken({ runId: 7, event: 'open' }, 'other-secret', () => NOW)
    expect(await verifyDigestEventToken(token, SECRET, () => NOW)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signDigestEventToken({ runId: 7, event: 'open' }, SECRET, () => NOW)
    const later = NOW + 91 * 24 * 60 * 60
    expect(await verifyDigestEventToken(token, SECRET, () => later)).toBeNull()
  })

  it('rejects click tokens whose destination is not http(s)', async () => {
    const token = await signDigestEventToken({ runId: 7, event: 'click', url: 'javascript:alert(1)' }, SECRET, () => NOW)
    expect(await verifyDigestEventToken(token, SECRET, () => NOW)).toBeNull()
  })

  it('rejects garbage and empty tokens', async () => {
    expect(await verifyDigestEventToken('', SECRET)).toBeNull()
    expect(await verifyDigestEventToken('not-a-token', SECRET)).toBeNull()
    expect(await verifyDigestEventToken('a.b.c', SECRET)).toBeNull()
  })
})

describe('linkKeyForUrl', () => {
  it('derives per-skill, per-repo, and fallback keys', () => {
    expect(linkKeyForUrl('https://skilld.dev/gh/acme/skills/alpha')).toBe('skill:acme/skills/alpha')
    expect(linkKeyForUrl('https://github.com/acme/skills')).toBe('github:acme/skills')
    expect(linkKeyForUrl('https://example.com/some/page?x=1')).toBe('url:example.com/some/page')
  })
})

describe('instrumentDigestHtml', () => {
  const unsubscribeUrl = 'https://skilld.dev/api/unsubscribe?t=unsub-token'

  function renderedHtml(): string {
    return renderDigest({
      login: 'harlan',
      windowStart: NOW - 7 * 86_400,
      windowEnd: NOW,
      unsubscribeUrl,
      entries: [{
        owner: 'acme',
        repo: 'skills',
        skillNames: ['alpha'],
        skills: [{ name: 'alpha', changeCount: 2, commitMessages: ['fix: better prompts'] }],
        changeCount: 2,
        summary: null,
      }],
    }).html
  }

  it('wraps content links, appends the pixel, and leaves unsubscribe untouched', async () => {
    const html = await instrumentDigestHtml(renderedHtml(), {
      runId: 11,
      siteUrl: 'https://skilld.dev',
      secret: SECRET,
      now: () => NOW,
    })

    // Unsubscribe link stays a direct RFC 8058-compatible URL.
    expect(html).toContain(`href="${unsubscribeUrl}"`)
    // Original destinations no longer appear as hrefs.
    expect(html).not.toContain('href="https://skilld.dev/gh/acme/skills/alpha"')
    expect(html).not.toContain('href="https://github.com/acme/skills"')
    // Both content links now route through the click redirect.
    const wrapped = [...html.matchAll(/href="https:\/\/skilld\.dev\/api\/digest\/click\?t=([^"]+)"/g)]
    expect(wrapped).toHaveLength(2)
    // Pixel is inside the body.
    expect(html).toMatch(/<img src="https:\/\/skilld\.dev\/api\/digest\/open\?t=[^"]+" width="1" height="1" alt="" style="display:none"><\/body>/)
  })

  it('produces click tokens that resolve back to the original destinations', async () => {
    const html = await instrumentDigestHtml(renderedHtml(), {
      runId: 11,
      siteUrl: 'https://skilld.dev',
      secret: SECRET,
      now: () => NOW,
    })
    const tokens = [...html.matchAll(/\/api\/digest\/click\?t=([^"]+)"/g)]
      .map(match => decodeURIComponent(match[1]!))
    const payloads = await Promise.all(tokens.map(token => verifyDigestEventToken(token, SECRET, () => NOW)))
    const urls = payloads.map(payload => payload?.u).sort()
    expect(urls).toEqual([
      'https://github.com/acme/skills',
      'https://skilld.dev/gh/acme/skills/alpha',
    ])
    for (const payload of payloads)
      expect(payload).toMatchObject({ r: 11, e: 'click' })
  })

  it('never double-wraps already instrumented links', async () => {
    const once = await instrumentDigestHtml(renderedHtml(), {
      runId: 11,
      siteUrl: 'https://skilld.dev',
      secret: SECRET,
      now: () => NOW,
    })
    const twice = await instrumentDigestHtml(once, {
      runId: 11,
      siteUrl: 'https://skilld.dev',
      secret: SECRET,
      now: () => NOW,
    })
    const clickLinks = [...twice.matchAll(/\/api\/digest\/click\?t=/g)]
    expect(clickLinks).toHaveLength(2)
  })

  it('appends the pixel even without a closing body tag', async () => {
    const html = await instrumentDigestHtml('<p>hello</p>', {
      runId: 3,
      siteUrl: 'https://skilld.dev/',
      secret: SECRET,
      now: () => NOW,
    })
    expect(html).toMatch(/^<p>hello<\/p><img src="https:\/\/skilld\.dev\/api\/digest\/open\?t=/)
  })
})

describe('digest event recording and metrics', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE digest_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        delivery_key TEXT NOT NULL UNIQUE,
        window_start INTEGER NOT NULL,
        window_end INTEGER NOT NULL,
        change_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        sent_at INTEGER
      );
    `)
    // Apply the real migration so its SQL is what the tests prove.
    sqlite.exec(readFileSync(join(__dirname, '../../migrations/0088_digest_email_events.sql'), 'utf8'))
    sqlite.exec(`
      INSERT INTO users (id) VALUES (1), (2);
      INSERT INTO digest_runs (id, user_id, delivery_key, window_start, window_end, change_count, status, sent_at)
      VALUES
        (11, 1, 'skilld-digest:1:7200', 0, 7200, 3, 'sent', 7300),
        (12, 2, 'skilld-digest:2:7200', 0, 7200, 1, 'sent', 7400),
        (13, 2, 'skilld-digest:2:14400', 7200, 14400, 0, 'skipped', NULL);
    `)
    db = wrapSqlite(sqlite)
  })

  afterEach(() => sqlite.close())

  it('records opens and clicks against an existing run', async () => {
    expect(await recordDigestEvent(db, { runId: 11, event: 'open', occurredAt: 8_000 })).toBe(true)
    expect(await recordDigestEvent(db, {
      runId: 11,
      event: 'click',
      linkKey: 'skill:acme/skills/alpha',
      url: 'https://skilld.dev/gh/acme/skills/alpha',
      occurredAt: 8_100,
    })).toBe(true)
    const rows = sqlite.prepare(`SELECT run_id, event, link_key, url, occurred_at FROM digest_email_events ORDER BY id`).all()
    expect(rows).toEqual([
      { run_id: 11, event: 'open', link_key: null, url: null, occurred_at: 8_000 },
      { run_id: 11, event: 'click', link_key: 'skill:acme/skills/alpha', url: 'https://skilld.dev/gh/acme/skills/alpha', occurred_at: 8_100 },
    ])
  })

  it('silently no-ops for runs that do not exist', async () => {
    expect(await recordDigestEvent(db, { runId: 999, event: 'open', occurredAt: 8_000 })).toBe(false)
    expect(sqlite.prepare(`SELECT COUNT(*) FROM digest_email_events`).pluck().get()).toBe(0)
  })

  it('aggregates per-run metrics with per-link click counts', async () => {
    await recordDigestEvent(db, { runId: 11, event: 'open', occurredAt: 8_000 })
    await recordDigestEvent(db, { runId: 11, event: 'open', occurredAt: 8_500 })
    await recordDigestEvent(db, { runId: 11, event: 'click', linkKey: 'skill:acme/skills/alpha', url: 'https://skilld.dev/gh/acme/skills/alpha', occurredAt: 8_600 })
    await recordDigestEvent(db, { runId: 11, event: 'click', linkKey: 'skill:acme/skills/alpha', url: 'https://skilld.dev/gh/acme/skills/alpha', occurredAt: 8_700 })
    await recordDigestEvent(db, { runId: 11, event: 'click', linkKey: 'github:acme/skills', url: 'https://github.com/acme/skills', occurredAt: 8_800 })
    await recordDigestEvent(db, { runId: 12, event: 'open', occurredAt: 9_000 })

    const metrics = await digestRunMetrics(db, 11)
    expect(metrics).toEqual({
      runId: 11,
      opens: 2,
      clicks: 3,
      firstOpenAt: 8_000,
      lastEventAt: 8_800,
      links: [
        { linkKey: 'skill:acme/skills/alpha', url: 'https://skilld.dev/gh/acme/skills/alpha', clicks: 2 },
        { linkKey: 'github:acme/skills', url: 'https://github.com/acme/skills', clicks: 1 },
      ],
    })
  })

  it('returns zeroed metrics for a run with no events', async () => {
    expect(await digestRunMetrics(db, 12)).toEqual({
      runId: 12,
      opens: 0,
      clicks: 0,
      firstOpenAt: null,
      lastEventAt: null,
      links: [],
    })
  })

  it('lists recent sent runs with engagement counts, excluding skipped runs', async () => {
    await recordDigestEvent(db, { runId: 11, event: 'open', occurredAt: 8_000 })
    await recordDigestEvent(db, { runId: 11, event: 'click', linkKey: 'github:acme/skills', url: 'https://github.com/acme/skills', occurredAt: 8_100 })

    const rows = await listDigestRunEngagement(db)
    expect(rows).toEqual([
      { runId: 12, userId: 2, deliveryKey: 'skilld-digest:2:7200', sentAt: 7_400, changeCount: 1, opens: 0, clicks: 0 },
      { runId: 11, userId: 1, deliveryKey: 'skilld-digest:1:7200', sentAt: 7_300, changeCount: 3, opens: 1, clicks: 1 },
    ])
  })
})

// Minimal D1 facade over better-sqlite3 (subset of the wrapper used by the
// digest delivery tests: prepare/bind/run/first/all with ?N placeholders).
function wrapSqlite(sqlite: Database.Database): D1Database {
  const prepare = (sql: string) => {
    const make = (params: unknown[]): D1PreparedStatement => ({
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
  return { prepare } as unknown as D1Database
}

function expand(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
  const expanded: unknown[] = []
  const nextSql = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(params[Number(raw) - 1])
    return '?'
  })
  return expanded.length ? { sql: nextSql, params: expanded } : { sql, params }
}
