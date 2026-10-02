/// <reference types="@cloudflare/workers-types" />
import type { DigestSelection, DigestUser } from './digest-select'
import type { UserRow } from './users'
import { selectDigestForUser } from './digest-select'

/**
 * What changed in a person's watched Repositories between `windowStart` and
 * `now`: the digest selection, read on demand instead of sent.
 */
export async function selectAccountChanges(
  db: D1Database,
  row: Pick<UserRow, 'id' | 'login' | 'digest_email' | 'email' | 'email_opt_in' | 'onboarded_at'>,
  windowStart: number,
  now: number,
): Promise<DigestSelection> {
  const user: DigestUser = {
    id: row.id,
    login: row.login,
    digest_email: row.digest_email,
    email: row.email,
    email_opt_in: row.email_opt_in,
    onboarded_at: row.onboarded_at,
  }
  const selection = await selectDigestForUser(db, user, now, { windowStart })
  return selection ?? { user, windowStart, windowEnd: now, cursorStart: 0, cursorEnd: 0, entries: [] }
}
