import type { GithubObjectCache, GithubReadFailure, PublicGithubSourceClient } from './github-source'
import type { ResolutionRow } from './state'
import { decryptToken } from '#layers/identity/server/utils/crypto'
import { createPublicGithubSourceClient } from './github-source'

/**
 * Record the signed-in account that asked for a public Resolution.
 *
 * Only that Resolution's build reads it, and only after the shared GitHub
 * credentials are rate limited. The row goes when the build settles.
 */
export async function recordResolutionRequester(
  db: D1Database,
  input: { resolutionId: string, accountId: number, now: number },
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO artifact_resolution_requesters (resolution_id, account_id, created_at)
     VALUES (?1, ?2, ?3)`,
  ).bind(input.resolutionId, input.accountId, input.now).run()
}

/** Forget who asked for a Resolution. Its build has settled. */
export async function forgetResolutionRequester(db: D1Database, resolutionId: string): Promise<void> {
  await db.prepare(`DELETE FROM artifact_resolution_requesters WHERE resolution_id = ?1`).bind(resolutionId).run()
}

export interface RequesterGithubDependencies {
  db: D1Database
  /**
   * `NUXT_TOKEN_KEY`, which encrypts the stored GitHub OAuth tokens. It is read
   * only when a requester's token is needed.
   */
  tokenKey: () => string
  fetch: typeof globalThis.fetch
  /** Unix seconds. */
  now: () => number
  /** Commits and trees by SHA, shared with the build's own client. */
  cache?: GithubObjectCache
  onReadFailure?: (failure: GithubReadFailure) => void
  /** Called when a stored token cannot be used. It never receives the token. */
  onUnusableToken?: (reason: string) => void
}

/**
 * The GitHub client of the account that asked for one public Resolution, or
 * null when nobody signed in asked for it, or the account holds no usable
 * GitHub token.
 *
 * The token is the account's GitHub sign-in token. Its scopes, `read:user` and
 * `user:email`, read public Repositories at that account's own quota, and no
 * private one. The public client also refuses any Repository GitHub reports
 * as private, so a build read with it can only produce public content.
 */
export function createRequesterGithubSource(
  dependencies: RequesterGithubDependencies,
): (row: ResolutionRow) => Promise<PublicGithubSourceClient | null> {
  return async (row) => {
    if (row.visibility !== 'public')
      return null
    const stored = await dependencies.db.prepare(
      `SELECT u.github_token_encrypted, u.github_token_expires_at
       FROM artifact_resolution_requesters r
       JOIN users u ON u.id = r.account_id
       WHERE r.resolution_id = ?1
       LIMIT 1`,
    ).bind(row.id).first<{ github_token_encrypted: string | null, github_token_expires_at: number | null }>()
    if (!stored?.github_token_encrypted)
      return null
    if (stored.github_token_expires_at !== null && stored.github_token_expires_at <= dependencies.now() + 60)
      return null
    const token = await decryptToken(stored.github_token_encrypted, dependencies.tokenKey()).then(
      value => ({ _tag: 'token' as const, value }),
      (error: unknown) => ({ _tag: 'unreadable' as const, reason: error instanceof Error ? error.message : String(error) }),
    )
    if (token._tag === 'unreadable') {
      dependencies.onUnusableToken?.(`The stored GitHub token did not decrypt: ${token.reason}`.slice(0, 200))
      return null
    }
    return createPublicGithubSourceClient({
      fetch: dependencies.fetch,
      token: token.value,
      cache: dependencies.cache,
      onReadFailure: dependencies.onReadFailure,
    })
  }
}

/**
 * A client that reads with the shared credential, and repeats a read the
 * shared quota refused with the requester's own client.
 *
 * Every other answer, success or rejection, stays the shared one, so a
 * requester's token is spent only when nothing else could read.
 */
export function withRequesterFallback(
  shared: PublicGithubSourceClient,
  requester: () => Promise<PublicGithubSourceClient | null>,
): PublicGithubSourceClient {
  let own: Promise<PublicGithubSourceClient | null> | null = null
  const ownClient = () => {
    own ??= requester()
    return own
  }
  return {
    async resolve(request) {
      const first = await shared.resolve(request)
      if (first._tag !== 'rejected' || first.code !== 'RATE_LIMITED')
        return first
      const client = await ownClient()
      return client ? await client.resolve(request) : first
    },
    async load(source) {
      const first = await shared.load(source)
      if (first._tag !== 'rejected' || first.code !== 'RATE_LIMITED')
        return first
      const client = await ownClient()
      return client ? await client.load(source) : first
    },
  }
}
