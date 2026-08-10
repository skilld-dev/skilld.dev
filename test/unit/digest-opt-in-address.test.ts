import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { identityEmailPatchBodySchema } from '../../layers/identity/shared/contracts/account'

const migrationPath = resolve(process.cwd(), 'migrations/0082_digest_opt_in_requires_address.sql')

describe('digest opt-in requires a deliverable address', () => {
  it('rejects opting in without an address', () => {
    const result = identityEmailPatchBodySchema.safeParse({ email_opt_in: true })
    expect(result.success).toBe(false)
  })

  it('rejects opting in with a blank address', () => {
    const result = identityEmailPatchBodySchema.safeParse({ digest_email: '   ', email_opt_in: true })
    expect(result.success).toBe(false)
  })

  it('rejects opting in with a malformed address', () => {
    const result = identityEmailPatchBodySchema.safeParse({ digest_email: 'not-an-email', email_opt_in: true })
    expect(result.success).toBe(false)
  })

  it('accepts opting in with an address and normalises it', () => {
    expect(identityEmailPatchBodySchema.parse({ digest_email: '  Harlan@Example.COM ', email_opt_in: true })).toEqual({
      digest_email: 'harlan@example.com',
      email_opt_in: true,
    })
  })

  it('accepts opting out without an address', () => {
    expect(identityEmailPatchBodySchema.parse({ email_opt_in: false })).toEqual({ email_opt_in: false })
  })

  it('repairs opted-in users that have no deliverable address', () => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          login TEXT NOT NULL,
          email TEXT,
          digest_email TEXT,
          email_opt_in INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO users (id, login, email, digest_email, email_opt_in) VALUES
          (1, 'no-address', NULL, NULL, 1),
          (2, 'blank-address', '', '   ', 1),
          (3, 'digest-address', NULL, 'digest@example.com', 1),
          (4, 'github-address', 'github@example.com', NULL, 1),
          (5, 'already-out', NULL, NULL, 0);
      `)

      sqlite.exec(readFileSync(migrationPath, 'utf8'))

      expect(sqlite.prepare(`SELECT id, email_opt_in FROM users ORDER BY id`).all()).toEqual([
        { id: 1, email_opt_in: 0 },
        { id: 2, email_opt_in: 0 },
        { id: 3, email_opt_in: 1 },
        { id: 4, email_opt_in: 1 },
        { id: 5, email_opt_in: 0 },
      ])
    }
    finally {
      sqlite.close()
    }
  })
})
