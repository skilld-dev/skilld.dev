/// <reference types="@cloudflare/workers-types" />
import type { ScanResult } from './scan-owned-repos'
import type { UserRow } from './users'
import { scanOwnedRepos } from './scan-owned-repos'
import { requireGithubUserToken } from './users'

/**
 * Remove every Skill of a Repository the account owns.
 *
 * The Owner must be the account's own login, compared without case like
 * GitHub does. Anything else is refused before a row is touched. The delete
 * uses the stored login, which has GitHub's casing, so `Octo/skills` still
 * reaches the rows of `octo/skills`.
 */
export async function unpublishOwnRepository(
  db: D1Database,
  login: string,
  ref: { owner: string, repo: string },
): Promise<{ _tag: 'NotOwner' } | { _tag: 'Unpublished', deleted: number }> {
  if (ref.owner.toLowerCase() !== login.toLowerCase())
    return { _tag: 'NotOwner' }
  const res = await db
    .prepare(`DELETE FROM skills WHERE owner = ?1 AND repo = ?2`)
    .bind(login, ref.repo)
    .run()
  return { _tag: 'Unpublished', deleted: res.meta?.changes ?? 0 }
}

/**
 * Scan the account's public Repositories for Skills and index them.
 *
 * Indexing is on by default and sign-in runs the same scan. An account that
 * turned it off gets no scan from here either, so the switch is the one place
 * that decides. A missing GitHub token throws the 401 that asks for a new
 * GitHub sign-in.
 */
export async function scanAccountRepositories(input: {
  db: D1Database
  env: Cloudflare.Env
  tokenKey: string
  user: Pick<UserRow, 'id' | 'login' | 'repo_indexing'>
}): Promise<{ _tag: 'IndexingOff' } | { _tag: 'Scanned', result: ScanResult }> {
  if (!input.user.repo_indexing)
    return { _tag: 'IndexingOff' }
  const userToken = await requireGithubUserToken(input.db, input.user.id, input.tokenKey)
  const result = await scanOwnedRepos({ login: input.user.login, userToken, db: input.db, env: input.env })
  return { _tag: 'Scanned', result }
}
