/// <reference types="@cloudflare/workers-types" />

/**
 * Build one person's real weekly, and optionally mail it to the operator.
 *
 * Exists because the cron fires once a week: without this the only way to see
 * what production would actually send is to wait for Monday, and the only way
 * to learn a send is broken is for it to be broken in front of everyone.
 *
 * Deliberately does not touch `weekly_runs`. A test is not a weekly run, and
 * writing one would both skew the window aggregates the admin view reports and
 * consume the claim that stops Monday sending twice.
 */

import { z } from 'zod'
import { sendEmailWithEnv, signUnsubToken } from '#layers/identity/server/utils/email'
import {
  loadWeeklyTrending,
  selectWeeklyForUser,
} from '#layers/identity/server/utils/weekly-select'
import { renderWeekly } from '#layers/identity/server/utils/weekly-template'
import { defineApiHandler } from '#shared/server/handler'

const input = z.object({
  /** Whose likes to build the email from. Defaults to the operator. */
  login: z.string().trim().min(1).max(80).default('harlan-zw'),
  /**
   * Where to mail it. Absent means render only.
   *
   * An explicit address rather than a boolean, so a test can never be sent to
   * the person whose likes were used to build it by accident.
   */
  to: z.string().email().optional(),
})

const WINDOW_SECONDS = 7 * 24 * 60 * 60

export default defineApiHandler({
  schema: input,
  handler: async ({ event, body, platform }) => {
    await requireAdmin(event)
    const db = platform.db
    const config = useRuntimeConfig(event)

    const user = await db.prepare(
      `SELECT id, login, name, digest_email, email FROM users WHERE login = ?1`,
    ).bind(body.login).first<{
      id: number
      login: string
      name: string | null
      digest_email: string | null
      email: string | null
    }>()
    if (!user)
      throw createError({ statusCode: 404, message: `No user with login ${body.login}` })

    const windowEnd = Math.floor(Date.now() / 1_000)
    const windowStart = windowEnd - WINDOW_SECONDS
    const [selection, trending] = await Promise.all([
      selectWeeklyForUser(db, user, windowStart, windowEnd),
      loadWeeklyTrending(db, windowEnd),
    ])

    const siteUrl = (config.publicSiteUrl as string) || 'https://skilld.dev'
    const unsubscribeToken = await signUnsubToken(user.id, config.tokenKey as string)
    const rendered = renderWeekly({
      recipientName: user.name,
      // Null, not the user's id. A preview is looked at by an operator, and a
      // click from it must not land in the recipient's click history.
      userId: null,
      windowStart,
      windowEnd,
      likedChanges: selection.likedChanges,
      likedOverflow: selection.likedOverflow,
      trackedCount: selection.trackedCount,
      trending,
      siteUrl,
      unsubscribeUrl: `${siteUrl}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken)}&list=weekly`,
      settingsUrl: `${siteUrl}/me`,
    })

    const counts = {
      liked: selection.likedChanges.length,
      likedOverflow: selection.likedOverflow,
      tracked: selection.trackedCount,
      trending: trending.length,
    }

    if (!body.to)
      return { _tag: 'rendered' as const, counts, subject: rendered.subject, html: rendered.html, text: rendered.text }

    // Marked in the subject so a test in an inbox is never mistaken for the
    // real Monday send.
    const result = await sendEmailWithEnv(platform.env, {
      to: body.to,
      from: config.email.from,
      subject: `[test] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    })

    return { _tag: 'accepted' as const, counts, to: body.to, delivery: result }
  },
})
