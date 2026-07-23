import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'migrations/0072_digest_delivery.sql')

describe('digest delivery migration', () => {
  it('preserves legacy rows and maps queued into an explicit retryable failure', () => {
    const sqlite = legacyDatabase()
    try {
      sqlite.exec(`
        INSERT INTO activity (id, type, owner, repo, name, occurred_at, sha) VALUES
          (1, 'skill_updated', 'acme', 'skills', 'alpha', 100, 'a'),
          (2, 'skill_updated', 'acme', 'skills', 'alpha', 200, 'b');
        INSERT INTO digest_runs (
          id, user_id, window_start, window_end, change_count, status,
          resend_id, ai_summary_used, sent_at, error
        ) VALUES
          (1, 1, 0, 100, 1, 'queued', NULL, 0, NULL, NULL),
          (2, 2, 0, 100, 1, 'sent', 'provider-2', 1, 100, NULL),
          (3, 3, 0, 100, 0, 'skipped', NULL, 0, NULL, NULL),
          (4, 4, 0, 100, 1, 'failed', NULL, 0, NULL, 'rejected');
      `)

      sqlite.exec(readFileSync(migrationPath, 'utf8'))

      expect(sqlite.prepare(
        `SELECT id, status, cursor_start, cursor_end, provider_message_id, error_code
         FROM digest_runs ORDER BY id`,
      ).all()).toEqual([
        { id: 1, status: 'failed', cursor_start: 0, cursor_end: 1, provider_message_id: null, error_code: 'legacy_queued' },
        { id: 2, status: 'sent', cursor_start: 0, cursor_end: 1, provider_message_id: 'provider-2', error_code: null },
        { id: 3, status: 'skipped', cursor_start: 0, cursor_end: 1, provider_message_id: null, error_code: null },
        { id: 4, status: 'failed', cursor_start: 0, cursor_end: 1, provider_message_id: null, error_code: 'legacy_failure' },
      ])
      expect(sqlite.prepare(`SELECT ingested_at FROM activity ORDER BY id`).pluck().all()).toEqual([100, 200])
    }
    finally {
      sqlite.close()
    }
  })

  it('keeps all delivery states distinct and rejects illegal state shapes', () => {
    const sqlite = legacyDatabase()
    try {
      sqlite.exec(readFileSync(migrationPath, 'utf8'))
      const base = `
        INSERT INTO digest_runs (
          user_id, delivery_key, window_start, window_end, cursor_start, cursor_end,
          change_count, status, claim_token, claimed_at, claim_expires_at, attempt_count,
          sending_at, sent_at, finished_at, provider_message_id, provider_status,
          error_code, error_message
        )`
      sqlite.exec(`${base} VALUES
        (1, 'claimed', 0, 100, 0, 0, 0, 'claimed', 'token', 1, 301, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        (2, 'sending', 0, 100, 0, 1, 1, 'sending', 'token', 1, NULL, 1, 2, NULL, NULL, NULL, NULL, NULL, NULL),
        (3, 'failed', 0, 100, 0, 1, 1, 'failed', 'token', 1, NULL, 1, 2, NULL, 3, NULL, 'rejected', 'provider_error', 'rejected'),
        (4, 'sent', 0, 100, 0, 1, 1, 'sent', 'token', 1, NULL, 1, 2, 3, 3, 'message', 'accepted', NULL, NULL),
        (5, 'skipped', 0, 100, 0, 0, 0, 'skipped', 'token', 1, NULL, 1, NULL, NULL, 2, NULL, NULL, NULL, NULL),
        (6, 'uncertain-unknown', 0, 100, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 2, NULL, 3, NULL, 'unknown', 'provider_outcome_unknown', 'transport closed'),
        (7, 'uncertain-accepted', 0, 100, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 2, NULL, 3, 'message-accepted', 'accepted_unpersisted', 'sent_persistence_failed', 'D1 unavailable');
      `)
      expect(sqlite.prepare(`SELECT status FROM digest_runs ORDER BY id`).pluck().all())
        .toEqual(['claimed', 'sending', 'failed', 'sent', 'skipped', 'uncertain', 'uncertain'])

      const illegal = [
        `(1, 'bad-sent', 0, 100, 0, 1, 1, 'sent', 'token', 1, NULL, 1, 2, 3, 3, NULL, 'accepted', NULL, NULL)`,
        `(1, 'bad-failed', 0, 101, 0, 1, 1, 'failed', 'token', 1, NULL, 1, 2, NULL, 3, NULL, 'rejected', NULL, NULL)`,
        `(1, 'bad-skipped', 0, 102, 0, 1, 1, 'skipped', 'token', 1, NULL, 1, NULL, NULL, 3, NULL, NULL, NULL, NULL)`,
        `(1, 'bad-claimed', 0, 103, 0, 1, 0, 'claimed', 'token', 1, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
        `(1, 'bad-sending-outcome', 0, 104, 0, 1, 1, 'sending', 'token', 1, NULL, 1, 2, NULL, NULL, NULL, 'unknown', NULL, NULL)`,
        `(1, 'bad-unknown-message', 0, 105, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 2, NULL, 3, 'message', 'unknown', 'provider_outcome_unknown', 'unknown')`,
        `(1, 'bad-accepted-message', 0, 106, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 2, NULL, 3, NULL, 'accepted_unpersisted', 'sent_persistence_failed', 'failed')`,
        `(1, 'bad-accepted-code', 0, 107, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 2, NULL, 3, 'message', 'accepted_unpersisted', 'wrong_code', 'failed')`,
        `(1, 'bad-uncertain-finished', 0, 108, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 2, NULL, NULL, NULL, 'unknown', 'provider_outcome_unknown', 'unknown')`,
        `(1, 'bad-uncertain-code-empty', 0, 109, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 2, NULL, 3, NULL, 'unknown', '', 'unknown')`,
        `(1, 'bad-uncertain-message-empty', 0, 110, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 2, NULL, 3, NULL, 'unknown', 'provider_outcome_unknown', ' ')`,
        `(1, 'bad-accepted-message-empty', 0, 111, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 2, NULL, 3, ' ', 'accepted_unpersisted', 'sent_persistence_failed', 'failed')`,
        `(1, 'bad-uncertain-order', 0, 112, 0, 1, 1, 'uncertain', 'token', 1, NULL, 1, 3, NULL, 2, NULL, 'unknown', 'provider_outcome_unknown', 'unknown')`,
      ]
      for (const values of illegal)
        expect(() => sqlite.exec(`${base} VALUES ${values}`)).toThrow()
    }
    finally {
      sqlite.close()
    }
  })

  it('allows sending and terminal rows to retain successful or fallback AI metadata', () => {
    const sqlite = legacyDatabase()
    try {
      sqlite.exec(readFileSync(migrationPath, 'utf8'))
      sqlite.exec(`
        INSERT INTO digest_runs (
          user_id, delivery_key, window_start, window_end, cursor_start, cursor_end,
          change_count, status, claim_token, claimed_at, claim_expires_at, sending_at,
          attempt_count, ai_summary_used, ai_fallback_reason, ai_input_tokens, ai_output_tokens
        ) VALUES
          (1, 'ai-success', 0, 100, 0, 1, 2, 'sending', 'token-success', 1, NULL, 2, 1, 1, NULL, 12, 5),
          (2, 'ai-fallback', 0, 100, 0, 1, 2, 'sending', 'token-fallback', 1, NULL, 2, 1, 0, 'provider_failure: unavailable', 0, 0);

        UPDATE digest_runs
        SET status = 'sent',
            sent_at = 3,
            finished_at = 3,
            provider_message_id = 'message-' || id,
            provider_status = 'accepted'
        WHERE delivery_key IN ('ai-success', 'ai-fallback');
      `)

      expect(sqlite.prepare(
        `SELECT delivery_key, status, ai_summary_used, ai_fallback_reason,
                ai_input_tokens, ai_output_tokens
         FROM digest_runs
         ORDER BY delivery_key`,
      ).all()).toEqual([
        {
          delivery_key: 'ai-fallback',
          status: 'sent',
          ai_summary_used: 0,
          ai_fallback_reason: 'provider_failure: unavailable',
          ai_input_tokens: 0,
          ai_output_tokens: 0,
        },
        {
          delivery_key: 'ai-success',
          status: 'sent',
          ai_summary_used: 1,
          ai_fallback_reason: null,
          ai_input_tokens: 12,
          ai_output_tokens: 5,
        },
      ])
    }
    finally {
      sqlite.close()
    }
  })

  it('requires explicit ingestion timestamps for future activity inserts and updates', () => {
    const sqlite = legacyDatabase()
    try {
      sqlite.exec(readFileSync(migrationPath, 'utf8'))

      expect(() => sqlite.exec(`
        INSERT INTO activity (type, owner, repo, name, occurred_at, sha)
        VALUES ('skill_updated', 'acme', 'skills', 'alpha', 1, 'missing');
      `)).toThrow('activity.ingested_at is required')
      expect(() => sqlite.exec(`
        INSERT INTO activity (type, owner, repo, name, occurred_at, ingested_at, sha)
        VALUES ('skill_updated', 'acme', 'skills', 'alpha', 1, 2, 'present');
      `)).not.toThrow()
      expect(() => sqlite.exec(`
        UPDATE activity SET ingested_at = NULL WHERE sha = 'present';
      `)).toThrow('activity.ingested_at is required')
    }
    finally {
      sqlite.close()
    }
  })
})

function legacyDatabase(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1), (2), (3), (4), (5), (6), (7);
    CREATE TABLE activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT,
      name TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      sha TEXT NOT NULL
    );
    CREATE INDEX idx_activity_recent ON activity(occurred_at DESC, type);
    CREATE INDEX idx_activity_skill ON activity(owner, repo, name);
    CREATE TABLE digest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      window_start INTEGER NOT NULL,
      window_end INTEGER NOT NULL,
      change_count INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued','sent','skipped','failed')),
      resend_id TEXT,
      ai_summary_used INTEGER NOT NULL DEFAULT 0,
      sent_at INTEGER,
      error TEXT
    );
    CREATE UNIQUE INDEX idx_digest_window ON digest_runs(user_id, window_end);
    CREATE INDEX idx_digest_status ON digest_runs(status, window_end DESC);
  `)
  return sqlite
}
