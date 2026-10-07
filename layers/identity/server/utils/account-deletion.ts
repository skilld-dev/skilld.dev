/// <reference types="@cloudflare/workers-types" />
import { decryptToken } from './crypto'

/**
 * Every statement that removes a row naming one account, children first.
 *
 * Each table is listed even when a foreign key would cascade from `users`:
 * several tables carry no foreign key at all, and the deletion must not depend
 * on foreign key enforcement. `test/unit/account-deletion.nuxt.test.ts` checks the
 * migrated schema, so a new table that names an account fails there until it
 * joins this list.
 *
 * Skills indexed from the account's public Repositories stay. GitHub is their
 * source, and discovery indexes public Repositories without an account.
 * Collections are the account's own writing on skilld.dev, so they go.
 */
const ACCOUNT_ROW_DELETES = [
  `DELETE FROM skill_likes WHERE user_id = ?1`,
  `DELETE FROM skill_subscriptions WHERE user_id = ?1`,
  `DELETE FROM user_starred_repos WHERE user_id = ?1`,
  `DELETE FROM collection_skills_v2
   WHERE collection_id IN (SELECT id FROM collections_v2 WHERE author_user_id = ?1)`,
  `DELETE FROM collections_v2 WHERE author_user_id = ?1`,
  `DELETE FROM cli_tokens WHERE user_id = ?1`,
  `DELETE FROM cli_auth_codes WHERE user_id = ?1`,
  `DELETE FROM cli_device_sessions WHERE user_id = ?1`,
  `DELETE FROM digest_runs WHERE user_id = ?1`,
  `DELETE FROM weekly_runs WHERE user_id = ?1`,
  `DELETE FROM email_preference_events WHERE user_id = ?1`,
  `DELETE FROM artifact_resolution_requesters WHERE account_id = ?1`,
  `DELETE FROM artifact_download_grants WHERE account_id = ?1`,
  `DELETE FROM private_artifact_attestations WHERE account_id = ?1`,
  `DELETE FROM private_artifacts WHERE account_id = ?1`,
  `DELETE FROM private_artifact_keys WHERE account_id = ?1`,
  `DELETE FROM artifact_check_results
   WHERE resolution_id IN (SELECT id FROM artifact_resolutions WHERE account_id = ?1)`,
  `DELETE FROM artifact_attestations
   WHERE resolution_id IN (SELECT id FROM artifact_resolutions WHERE account_id = ?1)`,
  `DELETE FROM artifact_resolutions WHERE account_id = ?1`,
  `DELETE FROM github_app_repositories
   WHERE installation_id IN (SELECT installation_id FROM github_app_installations WHERE account_id = ?1)`,
  `DELETE FROM github_app_installations WHERE account_id = ?1`,
  `DELETE FROM github_app_user_authorizations WHERE account_id = ?1`,
  `DELETE FROM skillgen_repositories WHERE user_id = ?1`,
  `DELETE FROM users WHERE id = ?1`,
] as const

/**
 * Delete one account and every row that names it. Returns the deleted row count.
 *
 * D1 runs a batch as one transaction, so a failed delete keeps the whole
 * account and the person can try again. The like and curator counters on
 * `skills` include this account, so each affected Skill joins the queue that
 * drain-skill-dirty recomputes.
 */
export async function deleteAccountData(db: D1Database, accountId: number, now: number): Promise<number> {
  const recounts = [
    db.prepare(
      `INSERT OR REPLACE INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
       SELECT owner, repo, name, 'like', ?2, 0
       FROM skill_likes
       WHERE user_id = ?1`,
    ).bind(accountId, now),
    db.prepare(
      `INSERT OR REPLACE INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
       SELECT cs.owner, cs.repo, cs.name, 'curator', ?2, 0
       FROM collection_skills_v2 AS cs
       JOIN collections_v2 AS c ON c.id = cs.collection_id
       WHERE c.author_user_id = ?1
         AND c.deleted_at IS NULL
         AND cs.name IS NOT NULL`,
    ).bind(accountId, now),
  ]
  const deletes = ACCOUNT_ROW_DELETES.map(sql => db.prepare(sql).bind(accountId))

  const results = await db.batch([...recounts, ...deletes])
  return results
    .slice(recounts.length)
    .reduce((total, result) => total + result.meta.changes, 0)
}

/** The GitHub sign-in token stored for an account, read before its row goes. */
export type StoredGithubGrant
  = | { _tag: 'stored', clientId: string, accessToken: string }
    | { _tag: 'absent' }
    | { _tag: 'unreadable' }

export async function loadGithubGrant(
  db: D1Database,
  accountId: number,
  tokenKey: string,
): Promise<StoredGithubGrant> {
  const row = await db.prepare(
    `SELECT github_token_encrypted, github_token_client_id FROM users WHERE id = ?1`,
  ).bind(accountId).first<{ github_token_encrypted: string | null, github_token_client_id: string | null }>()
  // Sign-out deletes the token, so a signed-out browser leaves nothing to revoke.
  if (!row?.github_token_encrypted || !row.github_token_client_id)
    return { _tag: 'absent' }

  const clientId = row.github_token_client_id
  return decryptToken(row.github_token_encrypted, tokenKey).then(
    (accessToken): StoredGithubGrant => ({ _tag: 'stored', clientId, accessToken }),
    // A token sealed with a retired key cannot be read. Account deletion must
    // still go ahead, so the caller reports the grant as not revoked.
    (): StoredGithubGrant => ({ _tag: 'unreadable' }),
  )
}

export interface GithubOAuthClient {
  clientId: string
  clientSecret: string
}

export type GithubGrantRevocation
  = | { _tag: 'revoked' }
    | { _tag: 'skipped', reason: 'no-token' | 'unreadable-token' | 'no-client-secret' | 'other-client' }
    | { _tag: 'failed', status: number | null }

const GITHUB_REVOKE_TIMEOUT_MS = 10_000

/**
 * Ask GitHub to delete the OAuth grant, which revokes every token skilld holds
 * for the person, including tokens on other devices.
 *
 * GitHub accepts only the credentials of the OAuth app that issued the token.
 * Every other outcome is a value: the account is already deleted when this
 * runs, and the person can still revoke skilld in their GitHub settings.
 */
export async function revokeGithubGrant(
  grant: StoredGithubGrant,
  client: GithubOAuthClient,
  fetcher: typeof globalThis.fetch,
): Promise<GithubGrantRevocation> {
  if (grant._tag === 'absent')
    return { _tag: 'skipped', reason: 'no-token' }
  if (grant._tag === 'unreadable')
    return { _tag: 'skipped', reason: 'unreadable-token' }
  if (!client.clientId || !client.clientSecret)
    return { _tag: 'skipped', reason: 'no-client-secret' }
  if (grant.clientId !== client.clientId)
    return { _tag: 'skipped', reason: 'other-client' }

  const url = `https://api.github.com/applications/${encodeURIComponent(client.clientId)}/grant`
  return fetcher(url, {
    method: 'DELETE',
    redirect: 'manual',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`,
      'Content-Type': 'application/json',
      'User-Agent': 'skilld.dev',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ access_token: grant.accessToken }),
    signal: AbortSignal.timeout(GITHUB_REVOKE_TIMEOUT_MS),
  }).then(
    (response): GithubGrantRevocation => response.status === 204
      ? { _tag: 'revoked' }
      : { _tag: 'failed', status: response.status },
    // Network failure or timeout. The status is unknown, not a rejection.
    (): GithubGrantRevocation => ({ _tag: 'failed', status: null }),
  )
}
