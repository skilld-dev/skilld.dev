import type { UserRow } from './users'

/** The settings a person can change. A key left out keeps its value. */
export interface AccountSettingsPatch {
  /** Already trimmed, lowercased, and checked as an address. */
  email?: string
  digest?: boolean
  weekly?: boolean
  likesPublic?: boolean
  repositoryIndexing?: boolean
}

/** The `users` columns a settings save writes. */
export interface AccountSettingsColumns {
  digest_email?: string
  email_opt_in?: 0 | 1
  weekly_opt_out?: 0 | 1
  likes_public?: 0 | 1
  repo_indexing?: 0 | 1
}

export type AccountSettingsPlan
  = | { _tag: 'Ok', columns: AccountSettingsColumns }
    | { _tag: 'MissingAddress' }

const SETTINGS_COLUMNS = ['digest_email', 'email_opt_in', 'weekly_opt_out', 'likes_public', 'repo_indexing'] as const

const bit = (value: boolean): 0 | 1 => value ? 1 : 0

/**
 * Turn a patch into the columns to write.
 *
 * Either email needs a deliverable address. A patch that turns one on without
 * an address keeps the saved address, else the GitHub address. The dashboard
 * form sends that same address when the person leaves the field as it is, and
 * storing it is the consent the weekly gate reads.
 */
export function planAccountSettings(
  row: Pick<UserRow, 'digest_email' | 'email'>,
  patch: AccountSettingsPatch,
): AccountSettingsPlan {
  const optingIn = patch.digest === true || patch.weekly === true
  const fallback = (row.digest_email ?? row.email ?? '').trim()
  const address = patch.email ?? (optingIn && fallback ? fallback : undefined)
  if (optingIn && !address)
    return { _tag: 'MissingAddress' }

  const columns: AccountSettingsColumns = {}
  if (address !== undefined)
    columns.digest_email = address
  if (patch.digest !== undefined)
    columns.email_opt_in = bit(patch.digest)
  // The weekly column is the unsubscribe switch, stored inverted.
  if (patch.weekly !== undefined)
    columns.weekly_opt_out = bit(!patch.weekly)
  if (patch.likesPublic !== undefined)
    columns.likes_public = bit(patch.likesPublic)
  if (patch.repositoryIndexing !== undefined)
    columns.repo_indexing = bit(patch.repositoryIndexing)
  return { _tag: 'Ok', columns }
}

/** Write only the named columns, so a save of one setting cannot reset another. */
export async function updateAccountSettings(
  db: D1Database,
  userId: number,
  columns: AccountSettingsColumns,
): Promise<void> {
  const named = SETTINGS_COLUMNS.filter(column => columns[column] !== undefined)
  if (!named.length)
    return
  const assignments = named.map((column, index) => `${column} = ?${index + 1}`)
  // Email choices finish setup from every entry point, including /me and the
  // CLI. A separate onboarding request must not gate an explicit digest opt-in.
  // Keep the first completion date, which starts the digest activity window.
  if (columns.email_opt_in !== undefined || columns.weekly_opt_out !== undefined)
    assignments.push('onboarded_at = COALESCE(onboarded_at, unixepoch())')
  await db.prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?${named.length + 1}`)
    .bind(...named.map(column => columns[column]!), userId)
    .run()
}
