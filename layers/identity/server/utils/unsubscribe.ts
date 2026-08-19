/// <reference types="@cloudflare/workers-types" />

/**
 * Turning off one list without touching the other.
 *
 * Kept apart from the route so the POST half required by RFC 8058 one-click
 * unsubscribe and the GET half a person clicks run identical SQL.
 */

export type UnsubList = 'weekly' | 'digest'

export interface UnsubOutcome {
  list: UnsubList
  heading: string
  body: string
}

export async function applyUnsubscribe(
  db: D1Database,
  userId: number,
  list: UnsubList,
): Promise<UnsubOutcome> {
  if (list === 'weekly') {
    await db.prepare(`UPDATE users SET weekly_opt_out = 1 WHERE id = ?1`).bind(userId).run()
    return {
      list,
      heading: 'Unsubscribed.',
      body: 'You will not get the weekly email again. Emails about repos you watch are unaffected.',
    }
  }
  await db.prepare(`UPDATE users SET email_opt_in = 0 WHERE id = ?1`).bind(userId).run()
  return {
    list,
    heading: 'Unsubscribed.',
    body: 'You will not get emails about repos you watch again. The weekly email is unaffected.',
  }
}
