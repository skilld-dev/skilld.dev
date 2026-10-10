import type { UserRow } from '../../layers/identity/server/utils/users'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAccountSkillValidation } from '../../layers/identity/server/utils/skill-validation'
import { sendSkillValidationSummary } from '../../layers/identity/server/utils/skill-validation-email'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const raw = '---\nname: example\ndescription: Works.\nversion: "1"\n---\nInstructions'

describe('account Skill validation', () => {
  let harness: ReturnType<typeof createSqliteD1>
  beforeEach(() => {
    harness = createSqliteD1(allMigrations())
    harness.raw.exec(`INSERT INTO users (id,github_id,login,created_at,last_login_at) VALUES (10001,10001,'owner',1,1)`)
  })
  afterEach(() => harness.close())

  function source(owner = 'owner', repo = 'skills', fork: number | null = 0, body = raw, name = 'example') {
    harness.raw.prepare(`INSERT OR IGNORE INTO repos (owner,repo,is_fork) VALUES (?,?,?)`).run(owner, repo, fork)
    harness.raw.prepare(`INSERT INTO skills (owner,repo,name,display_name,slug,source_resolved,rendered_raw,rendered_skill_path,rendered_commit_sha)
      VALUES (?,?,?,?,?,1,?,?,?)`).run(owner, repo, name, name, name, body, `skills/${name}/SKILL.md`, 'commit-sha')
  }

  function user(overrides: Partial<UserRow> = {}): UserRow {
    return { id: 10001, login: 'owner', email: 'owner@example.com', digest_email: null, email_opt_in: 1, weekly_opt_out: 1, repo_indexing: 1, ...overrides } as UserRow
  }

  it('checks only account-owned nonfork sources and reports unknown status as pending', async () => {
    source()
    source('other', 'private')
    source('owner', 'fork', 1)
    source('owner', 'unknown', null)
    const summary = await loadAccountSkillValidation(harness.db, 'OWNER')
    expect(summary).toMatchObject({ checked: 1, pending: 1, items: [{ repository: 'OWNER/skills', name: 'example', sourceUrl: 'https://github.com/OWNER/skills/blob/commit-sha/skills/example/SKILL.md' }] })
    expect(summary.items).toHaveLength(1)
  })

  it('validates every page and clears issues when the current source changes', async () => {
    for (let index = 0; index < 31; index++) {
      const name = `example-${index}`
      source('owner', 'skills', 0, raw.replace('name: example', `name: ${name}`), name)
    }
    expect((await loadAccountSkillValidation(harness.db, 'owner')).checked).toBe(31)
    harness.raw.prepare(`UPDATE skills SET rendered_raw = replace(rendered_raw, 'version: "1"', '')`).run()
    expect((await loadAccountSkillValidation(harness.db, 'owner')).items).toEqual([])
  })

  it('sends one summary after consent and never sends a captured address alone', async () => {
    source()
    const send = vi.fn(async () => ({ _tag: 'accepted' as const, messageId: 'message-1' }))
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user({ email_opt_in: 0, weekly_opt_out: 0 }), send, now: 10 })).toBe('skipped')
    expect(send).not.toHaveBeenCalled()
    await Promise.all([1, 2].map(() => sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 10 })))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toMatchObject({ subject: 'Your Skills have validation issues', text: expect.stringContaining('1 Skill has frontmatter issues.') })
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 20 })).toBe('skipped')
  })

  it('does not email portability notices or opted-out accounts', async () => {
    source('owner', 'skills', 0, raw.replace('version: "1"', 'context: fork'))
    const send = vi.fn(async () => ({ _tag: 'accepted' as const, messageId: 'message-1' }))
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 10 })).toBe('skipped')
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user({ repo_indexing: 0 }), send, now: 10 })).toBe('skipped')
    expect(send).not.toHaveBeenCalled()
  })

  it('retries rejected delivery but preserves an uncertain provider result', async () => {
    source()
    const send = vi.fn().mockResolvedValueOnce({ _tag: 'rejected', error: 'provider unavailable' }).mockResolvedValueOnce({ _tag: 'uncertain', error: 'missing receipt' })
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 10 })).toBe('rejected')
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 20 })).toBe('uncertain')
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 30 })).toBe('skipped')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('reclaims stale pre-send claims but keeps active claims and ambiguous delivery untouched', async () => {
    source()
    harness.raw.prepare(`INSERT INTO skill_validation_email_deliveries (user_id,status,attempted_at) VALUES (10001,'claimed',10)`).run()
    const send = vi.fn(async () => {
      expect(harness.raw.prepare(`SELECT status FROM skill_validation_email_deliveries WHERE user_id=10001`).get()).toEqual({ status: 'uncertain' })
      return { _tag: 'accepted' as const, messageId: 'receipt' }
    })
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 20 })).toBe('skipped')
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 1000 })).toBe('accepted')
    expect(send).toHaveBeenCalledTimes(1)
    harness.raw.prepare(`UPDATE skill_validation_email_deliveries SET status='uncertain',attempted_at=10`).run()
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 2000 })).toBe('skipped')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('skips source validation queries after a summary was delivered', async () => {
    source()
    harness.raw.prepare(`INSERT INTO skill_validation_email_deliveries (user_id,status,attempted_at) VALUES (10001,'accepted',10)`).run()
    const prepare = vi.spyOn(harness.db, 'prepare')
    const send = vi.fn()
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 1000 })).toBe('skipped')
    expect(prepare.mock.calls.every(([sql]) => !sql.includes('rendered_raw'))).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('includes one-click unsubscribe headers for the consented delivery list', async () => {
    source()
    const send = vi.fn().mockResolvedValue({ _tag: 'accepted', messageId: 'receipt' })
    await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user(), send, now: 1000 })
    expect(send.mock.calls[0]?.[0].headers).toMatchObject({
      'List-Unsubscribe': '<https://skilld.dev/api/unsubscribe?t=signed-token&list=digest>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
    harness.raw.prepare(`DELETE FROM skill_validation_email_deliveries`).run()
    await sendSkillValidationSummary({ signUnsubscribe: async () => 'signed-token', db: harness.db, user: user({ email_opt_in: 0, weekly_opt_out: 0, digest_email: 'owner@example.com' }), send, now: 2000 })
    expect(send.mock.calls[1]?.[0].headers['List-Unsubscribe']).toContain('list=weekly')
  })

  it('fences a paused worker when another connection reclaims its expired pre-send claim', async () => {
    source()
    let resume: () => void = () => {}
    let started: () => void = () => {}
    const paused = new Promise<void>((resolve) => {
      resume = resolve
    })
    const waiting = new Promise<void>((resolve) => {
      started = resolve
    })
    const prepare = harness.db.prepare.bind(harness.db)
    const db = {
      ...harness.db,
      prepare(sql: string) {
        const statement = prepare(sql)
        if (!sql.includes('Delivery started without'))
          return statement
        return {
          ...statement,
          bind(...values: unknown[]) {
            const bound = statement.bind(...values)
            return {
              ...bound,
              async first<T>() {
                if (values[1] === 10) {
                  started()
                  await paused
                }
                return bound.first<T>()
              },
            }
          },
        } as D1PreparedStatement
      },
    } as D1Database
    const send = vi.fn().mockResolvedValue({ _tag: 'accepted', messageId: 'receipt' })
    const oldWorker = sendSkillValidationSummary({ signUnsubscribe: async () => 'token', db, user: user(), send, now: 10 })
    await waiting
    expect(await sendSkillValidationSummary({ signUnsubscribe: async () => 'token', db, user: user(), send, now: 1000 })).toBe('accepted')
    resume()
    expect(await oldWorker).toBe('skipped')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
