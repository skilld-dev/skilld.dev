import type { RepoChange } from '../utils/digest-summary'
import {
  loadDigestEligibleUsers,
  selectDigestForUser,
  shouldFireForUser,
} from '../utils/digest-select'
import { summariseChanges } from '../utils/digest-summary'
/// <reference types="@cloudflare/workers-types" />
import { renderDigest } from '../utils/digest-template'
import { sendEmail, signUnsubToken } from '../utils/email'

// Fires every hour from the cloudflare cron registered in nuxt.config.ts.
// Selects users whose configured (dow, hour, tz) matches the current UTC
// slot, builds and sends digests, writes a digest_runs row per user.
export default defineTask({
  meta: {
    name: 'send-digests',
    description: 'Send weekly/daily digest emails to opted-in users when their cadence slot matches',
  },
  async run({ context }) {
    const cf = (context as Record<string, unknown>).cloudflare as { env?: Record<string, unknown> } | undefined
    const env = cf?.env
    const db = env?.DB as D1Database | undefined
    if (!db) {
      console.warn('[send-digests] D1 binding missing')
      return { result: { error: 'no-db' } }
    }

    const config = useRuntimeConfig()
    const tokenKey = config.tokenKey as string
    const cfAigToken = config.cfAigToken as string
    const aiBinding = env?.AI as { gateway: (n: string) => { getUrl: (p: string) => Promise<string> } } | undefined
    const siteUrl = (config.publicSiteUrl as string) || 'https://skilld.dev'

    const nowSec = Math.floor(Date.now() / 1000)
    const users = await loadDigestEligibleUsers(db)
    const fireUsers = users.filter(u => shouldFireForUser(u, nowSec))

    const summary = { eligible: users.length, fired: fireUsers.length, sent: 0, skipped: 0, failed: 0 }

    for (const user of fireUsers) {
      const selection = await selectDigestForUser(db, user, nowSec)
      if (!selection)
        continue

      const recipient = (user.digest_email || user.email || '').trim()
      if (!recipient) {
        await db.prepare(
          `INSERT OR IGNORE INTO digest_runs (user_id, window_start, window_end, change_count, status, error)
           VALUES (?1, ?2, ?3, 0, 'failed', 'no recipient')`,
        ).bind(user.id, selection.windowStart, selection.windowEnd).run()
        summary.failed += 1
        continue
      }

      // No changes → write a skipped row so the next window's start advances.
      if (!selection.entries.length) {
        await db.prepare(
          `INSERT OR IGNORE INTO digest_runs (user_id, window_start, window_end, change_count, status)
           VALUES (?1, ?2, ?3, 0, 'skipped')`,
        ).bind(user.id, selection.windowStart, selection.windowEnd).run()
        summary.skipped += 1
        continue
      }

      // AI summary pass. Failures are non-blocking — the template renders
      // a commit-list bullet body when summary is null/missing.
      const subs = selection.entries.map(e => ({
        owner: e.owner,
        repo: e.repo,
        skillName: e.skillName,
        description: e.description,
      }))
      const changes: RepoChange[] = selection.entries.map(e => ({
        owner: e.owner,
        repo: e.repo,
        commitMessages: e.commitMessages,
        diffExcerpt: '', // Phase 3 cuts the SKILL.md diff fetch — commits-only summary
      }))
      const ai = (aiBinding && cfAigToken)
        ? await summariseChanges({ ai: aiBinding, cfAigToken, subscriptions: subs, changes }).catch(() => null)
        : null
      const summariesByRepo = new Map<string, string>()
      for (const s of ai?.summaries ?? [])
        summariesByRepo.set(`${s.owner}/${s.repo}`, s.sentence)

      const unsubToken = await signUnsubToken(user.id, tokenKey)
      const unsubscribeUrl = `${siteUrl}/api/unsubscribe?t=${encodeURIComponent(unsubToken)}`
      const rendered = renderDigest({
        login: user.login,
        windowStart: selection.windowStart,
        windowEnd: selection.windowEnd,
        unsubscribeUrl,
        entries: selection.entries.map(e => ({
          owner: e.owner,
          repo: e.repo,
          skillName: e.skillName,
          commitCount: e.commitCount,
          summary: summariesByRepo.get(`${e.owner}/${e.repo}`) ?? null,
          commitMessages: e.commitMessages,
        })),
      })

      // Need an H3Event-shaped object for sendEmail's binding access.
      // Synthesise the minimum surface — this task runs in cron context so
      // there is no real event; the binding is read off cloudflare.env.
      const fakeEvent = {
        context: { cloudflare: { env } },
      } as unknown as Parameters<typeof sendEmail>[0]

      const result = await sendEmail(fakeEvent, {
        to: recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })

      if (result.ok) {
        await db.prepare(
          `INSERT OR IGNORE INTO digest_runs
             (user_id, window_start, window_end, change_count, status, resend_id, ai_summary_used, sent_at)
           VALUES (?1, ?2, ?3, ?4, 'sent', ?5, ?6, ?7)`,
        ).bind(
          user.id,
          selection.windowStart,
          selection.windowEnd,
          selection.entries.length,
          result.messageId ?? null,
          summariesByRepo.size ? 1 : 0,
          nowSec,
        ).run()
        summary.sent += 1
      }
      else {
        await db.prepare(
          `INSERT OR IGNORE INTO digest_runs
             (user_id, window_start, window_end, change_count, status, error)
           VALUES (?1, ?2, ?3, ?4, 'failed', ?5)`,
        ).bind(
          user.id,
          selection.windowStart,
          selection.windowEnd,
          selection.entries.length,
          result.error ?? 'unknown',
        ).run()
        summary.failed += 1
      }
    }

    return { result: summary }
  },
})
